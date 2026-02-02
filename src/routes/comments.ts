import { Hono } from "hono";
import { createAuthMiddleware, type AuthContext, type AuthDependency } from "@/middleware/auth";
import type { PrismaClient } from "../../generated/prisma/client";
import { validateBody, validateParams, validateQuery } from "@/utils/validation";
import { createCommentSchema, getCommentsQuerySchema, updateCommentSchema } from "@/schemas/post.schema";
import { escapeHtml } from "@/utils/sanitize";
import { idParamSchema, postIdParamSchema } from "@/schemas/params.schema";

export const createCommentsRoute = (db: PrismaClient, authDep: AuthDependency) => {
    const comments = new Hono<AuthContext>();
    const { requireAuth, requireRole, optionalAuth } = createAuthMiddleware(authDep);

    // ============================================
    // GET ALL COMMENTS (Admin only)
    // ============================================
    comments.get("/all", requireAuth, requireRole("ADMIN"), async (c) => {
        const query = validateQuery(c, getCommentsQuerySchema);
        if (!query) return;

        const { search, authorId, postId, page, limit } = query;
        const skip = (page - 1) * limit;

        // Build where clause
        const where: Record<string, unknown> = {};

        if (search) {
            where.content = { contains: search, mode: "insensitive" };
        }

        if (authorId) {
            where.authorId = authorId;
        }

        if (postId) {
            where.postId = postId;
        }

        const [commentsData, total] = await Promise.all([
            db.comment.findMany({
                where,
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                    post: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            status: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            db.comment.count({ where }),
        ]);

        return c.json({
            comments: commentsData,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    });

    // ============================================
    // GET MY COMMENTS (All comments by current user)
    // ============================================
    comments.get("/my-comments", requireAuth, async (c) => {
        const user = c.get("user");

        const myComments = await db.comment.findMany({
            where: { authorId: user.id },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
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

        return c.json({ comments: myComments });
    });

    // ============================================
    // GET COMMENTS FOR A POST
    // ============================================
    comments.get("/posts/:postId", optionalAuth, async (c) => {
        const params = validateParams(c, postIdParamSchema);
        if (!params) return;
        const postId = params.postId;

        // Check if post exists and is published
        const post = await db.post.findUnique({
            where: { id: postId },
            select: { status: true, authorId: true },
        });

        if (!post) {
            return c.json({ error: "Post not found" }, 404);
        }

        // Only show comments for published posts (unless user is admin/author)
        const user = c.get("user");
        if (post.status !== "PUBLISHED") {
            const isAuthor = user?.id === post.authorId;
            const isAdmin = user?.role === "ADMIN";
            if (!isAuthor && !isAdmin) {
                return c.json({ error: "Post not found" }, 404);
            }
        }

        const postComments = await db.comment.findMany({
            where: { postId },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return c.json({ comments: postComments });
    });

    // ============================================
    // CREATE COMMENT
    // ============================================
    comments.post("/posts/:postId", requireAuth, async (c) => {
        const params = validateParams(c, postIdParamSchema);
        if (!params) return;
        const postId = params.postId;
        const user = c.get("user");
        const data = await validateBody(c, createCommentSchema);
        if (!data) return;

        // Check if post exists and is published
        const post = await db.post.findUnique({
            where: { id: postId },
            select: { status: true },
        });

        if (!post) {
            return c.json({ error: "Post not found" }, 404);
        }

        // Only allow comments on published posts
        if (post.status !== "PUBLISHED") {
            return c.json({ error: "Cannot comment on unpublished posts" }, 400);
        }

        // Sanitize comment content (escape HTML to prevent XSS)
        const sanitizedContent = escapeHtml(data.content);

        const comment = await db.comment.create({
            data: {
                content: sanitizedContent,
                postId,
                authorId: user.id,
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
            },
        });

        return c.json(comment, 201);
    });

    // ============================================
    // UPDATE COMMENT (Owner or ADMIN only)
    // ============================================
    comments.put("/:id", requireAuth, async (c) => {
        const params = validateParams(c, idParamSchema);
        if (!params) return;
        const commentId = params.id;
        const user = c.get("user");
        const data = await validateBody(c, updateCommentSchema);
        if (!data) return;

        const existingComment = await db.comment.findUnique({
            where: { id: commentId },
        });

        if (!existingComment) {
            return c.json({ error: "Comment not found" }, 404);
        }

        // Check ownership
        const isOwner = existingComment.authorId === user.id;
        const isAdmin = user.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return c.json({ error: "Forbidden" }, 403);
        }

        // Sanitize comment content
        const sanitizedContent = escapeHtml(data.content);

        const updatedComment = await db.comment.update({
            where: { id: commentId },
            data: {
                content: sanitizedContent,
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
            },
        });

        return c.json(updatedComment);
    });

    // ============================================
    // DELETE COMMENT (Owner or ADMIN only)
    // ============================================
    comments.delete("/:id", requireAuth, async (c) => {
        const params = validateParams(c, idParamSchema);
        if (!params) return;
        const commentId = params.id;
        const user = c.get("user");

        const existingComment = await db.comment.findUnique({
            where: { id: commentId },
        });

        if (!existingComment) {
            return c.json({ error: "Comment not found" }, 404);
        }

        const isOwner = existingComment.authorId === user.id;
        const isAdmin = user.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return c.json({ error: "Forbidden" }, 403);
        }

        await db.comment.delete({
            where: { id: commentId },
        });

        return c.json({ message: "Comment deleted successfully" });
    });

    return comments;
};

// For backward compatibility with existing imports
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
export default createCommentsRoute(prisma, auth);
