import { Hono } from "hono";
import { requireAuth, requireRole, type AuthContext } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { validateBody, validateParams, validateQuery } from "@/utils/validation";
import {
    publishPostSchema,
    approvePublishRequestSchema,
    rejectPublishRequestSchema,
    getPublishRequestsQuerySchema,
} from "@/schemas/post.schema";
import { postIdParamSchema, requestIdParamSchema } from "@/schemas/params.schema";

const publish = new Hono<AuthContext>();

function isUniqueConstraintError(error: unknown, fields?: string[]): boolean {
    if (!error || typeof error !== "object") return false;
    const prismaError = error as { code?: string; meta?: { target?: string[] | string } };
    if (prismaError.code !== "P2002") return false;
    if (!fields || fields.length === 0) return true;
    const target = prismaError.meta?.target;
    if (!target) return true;
    if (Array.isArray(target)) {
        return fields.some((field) => target.includes(field));
    }
    return fields.includes(target);
}

// ============================================
// REQUEST PUBLISH (Author requests to publish their draft)
// ============================================
publish.post("/posts/:postId/request", requireAuth, requireRole("AUTHOR", "ADMIN"), async (c) => {
    const params = validateParams(c, postIdParamSchema);
    if (!params) return;
    const postId = params.postId;
    const user = c.get("user");
    const data = await validateBody(c, publishPostSchema);
    if (!data) return;

    // Find the post
    const post = await prisma.post.findUnique({
        where: { id: postId },
    });

    if (!post) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Check ownership
    if (post.authorId !== user.id && user.role !== "ADMIN") {
        return c.json({ error: "Forbidden" }, 403);
    }

    // Check if post is in DRAFT status
    if (post.status !== "DRAFT") {
        return c.json({ error: "Only draft posts can request publishing" }, 400);
    }

    // Check if there's already a pending request
    const existingRequest = await prisma.publishRequest.findFirst({
        where: {
            postId,
            status: "PENDING",
        },
    });

    if (existingRequest) {
        return c.json({ error: "A publish request is already pending for this post" }, 400);
    }

    // Create publish request and update post status atomically
    let publishRequest;
    try {
        publishRequest = await prisma.$transaction(async (tx) => {
            const createdRequest = await tx.publishRequest.create({
                data: {
                    postId,
                    authorId: user.id,
                    status: "PENDING",
                    message: data.message,
                },
                include: {
                    post: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                        },
                    },
                    author: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            await tx.post.update({
                where: { id: postId },
                data: { status: "PENDING_APPROVAL" },
            });

            return createdRequest;
        });
    } catch (error) {
        if (isUniqueConstraintError(error, ["postId", "status"])) {
            return c.json({ error: "A publish request is already pending for this post" }, 400);
        }
        throw error;
    }

    return c.json(publishRequest, 201);
});

// ============================================
// GET ALL PUBLISH REQUESTS (ADMIN only)
// ============================================
publish.get("/requests", requireAuth, requireRole("ADMIN"), async (c) => {
    const query = validateQuery(c, getPublishRequestsQuerySchema);
    if (!query) return;

    const { status, authorId } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (authorId) where.authorId = authorId;

    const requests = await prisma.publishRequest.findMany({
        where,
        include: {
            post: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    excerpt: true,
                    coverImage: true,
                    createdAt: true,
                    updatedAt: true,
                },
            },
            author: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return c.json({ requests });
});

// ============================================
// GET MY PUBLISH REQUESTS (Author's own requests)
// ============================================
publish.get("/my-requests", requireAuth, async (c) => {
    const user = c.get("user");

    const requests = await prisma.publishRequest.findMany({
        where: {
            authorId: user.id,
        },
        include: {
            post: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    status: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return c.json({ requests });
});

// ============================================
// APPROVE PUBLISH REQUEST (ADMIN only)
// ============================================
publish.post("/requests/:requestId/approve", requireAuth, requireRole("ADMIN"), async (c) => {
    const params = validateParams(c, requestIdParamSchema);
    if (!params) return;
    const requestId = params.requestId;
    const data = await validateBody(c, approvePublishRequestSchema);
    if (!data) return;

    // Find the request
    const request = await prisma.publishRequest.findUnique({
        where: { id: requestId },
        include: {
            post: true,
        },
    });

    if (!request) {
        return c.json({ error: "Publish request not found" }, 404);
    }

    if (request.status !== "PENDING") {
        return c.json({ error: "This request has already been processed" }, 400);
    }

    // Approve request and publish post atomically
    const updatedRequest = await prisma.$transaction(async (tx) => {
        const updated = await tx.publishRequest.update({
            where: { id: requestId },
            data: {
                status: "APPROVED",
                message: data.message,
            },
            include: {
                post: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                    },
                },
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        await tx.post.update({
            where: { id: request.postId },
            data: {
                status: "PUBLISHED",
                publishedAt: new Date(),
            },
        });

        return updated;
    });

    return c.json(updatedRequest);
});

// ============================================
// REJECT PUBLISH REQUEST (ADMIN only)
// ============================================
publish.post("/requests/:requestId/reject", requireAuth, requireRole("ADMIN"), async (c) => {
    const params = validateParams(c, requestIdParamSchema);
    if (!params) return;
    const requestId = params.requestId;
    const data = await validateBody(c, rejectPublishRequestSchema);
    if (!data) return;

    const request = await prisma.publishRequest.findUnique({
        where: { id: requestId },
    });

    if (!request) {
        return c.json({ error: "Publish request not found" }, 404);
    }

    if (request.status !== "PENDING") {
        return c.json({ error: "This request has already been processed" }, 400);
    }

    // Reject request and revert post to draft atomically
    const updatedRequest = await prisma.$transaction(async (tx) => {
        const updated = await tx.publishRequest.update({
            where: { id: requestId },
            data: {
                status: "REJECTED",
                message: data.message,
            },
            include: {
                post: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                    },
                },
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        await tx.post.update({
            where: { id: request.postId },
            data: {
                status: "DRAFT",
            },
        });

        return updated;
    });

    return c.json(updatedRequest);
});

// ============================================
// CANCEL PUBLISH REQUEST (Author cancels their own request)
// ============================================
publish.delete("/requests/:requestId", requireAuth, async (c) => {
    const params = validateParams(c, requestIdParamSchema);
    if (!params) return;
    const requestId = params.requestId;
    const user = c.get("user");

    const request = await prisma.publishRequest.findUnique({
        where: { id: requestId },
    });

    if (!request) {
        return c.json({ error: "Publish request not found" }, 404);
    }

    // Check ownership (or admin)
    if (request.authorId !== user.id && user.role !== "ADMIN") {
        return c.json({ error: "Forbidden" }, 403);
    }

    if (request.status !== "PENDING") {
        return c.json({ error: "Only pending requests can be cancelled" }, 400);
    }

    // Delete request and revert post to draft atomically
    await prisma.$transaction(async (tx) => {
        await tx.publishRequest.delete({
            where: { id: requestId },
        });
        await tx.post.update({
            where: { id: request.postId },
            data: { status: "DRAFT" },
        });
    });

    return c.json({ message: "Publish request cancelled successfully" });
});

export default publish;
