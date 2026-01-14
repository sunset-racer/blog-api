import { Hono } from "hono";
import { requireAuth, optionalAuth, type AuthContext } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/utils/validation";
import { createCommentSchema, updateCommentSchema } from "@/schemas/post.schema";

const comments = new Hono<AuthContext>();

// ============================================
// GET MY COMMENTS (All comments by current user)
// ============================================
comments.get("/my-comments", requireAuth, async (c) => {
    const user = c.get("user");

    const myComments = await prisma.comment.findMany({
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
    const postId = c.req.param("postId");

    // Check if post exists and is published
    const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { status: true },
    });

    if (!post) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Only show comments for published posts (unless user is admin/author)
    const user = c.get("user");
    if (post.status !== "PUBLISHED" && !user) {
        return c.json({ error: "Post not found" }, 404);
    }

    const postComments = await prisma.comment.findMany({
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
    const postId = c.req.param("postId");
    const user = c.get("user");
    const data = await validateBody(c, createCommentSchema);
    if (!data) return;

    // Check if post exists and is published
    const post = await prisma.post.findUnique({
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

    const comment = await prisma.comment.create({
        data: {
            content: data.content,
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
    const commentId = c.req.param("id");
    const user = c.get("user");
    const data = await validateBody(c, updateCommentSchema);
    if (!data) return;

    const existingComment = await prisma.comment.findUnique({
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

    const updatedComment = await prisma.comment.update({
        where: { id: commentId },
        data: {
            content: data.content,
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
    const commentId = c.req.param("id");
    const user = c.get("user");

    const existingComment = await prisma.comment.findUnique({
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

    await prisma.comment.delete({
        where: { id: commentId },
    });

    return c.json({ message: "Comment deleted successfully" });
});

export default comments;
