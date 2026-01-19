import { Hono } from "hono";
import { requireAuth, requireRole, optionalAuth, type AuthContext } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { validateBody, validateQuery } from "@/utils/validation";
import { createPostSchema, updatePostSchema, getPostsQuerySchema } from "@/schemas/post.schema";
import { generateUniqueSlug, generateUniqueTagSlug } from "@/utils/slug";
import { sanitizeMarkdown, sanitizeText } from "@/utils/sanitize";

const posts = new Hono<AuthContext>();

// ============================================
// GET ALL POSTS (with pagination, search, filtering)
// ============================================
posts.get("/", optionalAuth, async (c) => {
    const query = validateQuery(c, getPostsQuerySchema);
    if (!query) return;

    const { page, limit, status, authorId, tagSlug, isFeatured, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    // Apply visibility rules based on authentication and role
    const user = c.get("user");
    const isAdmin = user?.role === "ADMIN";

    if (!user) {
        where.status = "PUBLISHED";
    } else if (isAdmin) {
        if (status) where.status = status;
    } else {
        if (status && status !== "PUBLISHED") {
            where.status = status;
            where.authorId = user.id;
        } else {
            where.OR = [{ status: "PUBLISHED" }, { authorId: user.id }];
        }
    }

    if (authorId) {
        if (user && !isAdmin && authorId !== user.id) {
            where.status = "PUBLISHED";
        }
        where.authorId = authorId;
    }
    if (isFeatured !== undefined) where.isFeatured = isFeatured;

    if (tagSlug) {
        where.tags = {
            some: {
                tag: { slug: tagSlug },
            },
        };
    }

    if (search) {
        const searchFilter = [
            { title: { contains: search, mode: "insensitive" } },
            { content: { contains: search, mode: "insensitive" } },
            { excerpt: { contains: search, mode: "insensitive" } },
        ];

        if (where.OR) {
            where.AND = [{ OR: where.OR }, { OR: searchFilter }];
            delete where.OR;
        } else {
            where.OR = searchFilter;
        }
    }

    // Execute query with pagination
    const [postsData, total] = await Promise.all([
        prisma.post.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
                tags: {
                    include: {
                        tag: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        comments: true,
                    },
                },
            },
        }),
        prisma.post.count({ where }),
    ]);

    return c.json({
        posts: postsData.map((post) => ({
            ...post,
            views: post.viewCount, // Map viewCount to views
            tags: post.tags.map((pt) => pt.tag),
            commentsCount: post._count.comments,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit),
        },
    });
});

// ============================================
// GET SINGLE POST BY ID (for editing)
// ============================================
posts.get("/by-id/:id", requireAuth, async (c) => {
    const postId = c.req.param("id");
    const user = c.get("user");

    const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    role: true,
                },
            },
            tags: {
                include: {
                    tag: true,
                },
            },
            comments: {
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
            },
        },
    });

    if (!post) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Check if user can view this post (must be author or admin)
    const isAuthor = user.id === post.authorId;
    const isAdmin = user.role === "ADMIN";

    if (!isAuthor && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({
        ...post,
        views: post.viewCount,
        tags: post.tags.map((pt) => pt.tag),
    });
});

// ============================================
// GET SINGLE POST BY SLUG
// ============================================
posts.get("/:slug", optionalAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");

    const post = await prisma.post.findUnique({
        where: { slug },
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    role: true,
                },
            },
            tags: {
                include: {
                    tag: true,
                },
            },
            comments: {
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
            },
        },
    });

    if (!post) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Check if user can view this post
    const isAuthor = user?.id === post.authorId;
    const isAdmin = user?.role === "ADMIN";
    const isPublished = post.status === "PUBLISHED";

    if (!isPublished && !isAuthor && !isAdmin) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Increment view count (only for published posts)
    if (isPublished) {
        await prisma.post.update({
            where: { id: post.id },
            data: { viewCount: { increment: 1 } },
        });
    }

    return c.json({
        ...post,
        views: post.viewCount + (isPublished ? 1 : 0), // Map viewCount to views and add 1 if incremented
        tags: post.tags.map((pt) => pt.tag),
    });
});

// ============================================
// CREATE POST (AUTHORS + ADMINS only)
// ============================================
posts.post("/", requireAuth, requireRole("AUTHOR", "ADMIN"), async (c) => {
    const user = c.get("user");
    const data = await validateBody(c, createPostSchema);
    if (!data) return;

    // Generate unique slug from title
    const slug = await generateUniqueSlug(data.title);

    // Sanitize content
    const sanitizedTitle = sanitizeText(data.title);
    const sanitizedContent = sanitizeMarkdown(data.content);
    const sanitizedExcerpt = data.excerpt ? sanitizeText(data.excerpt) : undefined;

    // Create post with tag handling in a transaction
    const post = await prisma.$transaction(async (tx) => {
        const tagConnections = [];
        if (data.tags && data.tags.length > 0) {
            for (const tagName of data.tags) {
                let tag = await tx.tag.findFirst({
                    where: { name: { equals: tagName, mode: "insensitive" } },
                });

                if (!tag) {
                    const tagSlug = await generateUniqueTagSlug(tagName);
                    tag = await tx.tag.create({
                        data: {
                            name: tagName,
                            slug: tagSlug,
                        },
                    });
                }

                tagConnections.push({ tagId: tag.id });
            }
        }

        return tx.post.create({
            data: {
                title: sanitizedTitle,
                slug,
                content: sanitizedContent,
                excerpt: sanitizedExcerpt,
                coverImage: data.coverImage,
                isFeatured: data.isFeatured || false,
                authorId: user.id,
                status: "DRAFT",
                tags: {
                    create: tagConnections,
                },
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                tags: {
                    include: {
                        tag: true,
                    },
                },
            },
        });
    });

    return c.json(
        {
            ...post,
            tags: post.tags.map((pt) => pt.tag),
        },
        201,
    );
});

// ============================================
// UPDATE POST (Owner or ADMIN only)
// ============================================
posts.put("/:id", requireAuth, async (c) => {
    const postId = c.req.param("id");
    const user = c.get("user");
    const data = await validateBody(c, updatePostSchema);
    if (!data) return;

    // Find existing post
    const existingPost = await prisma.post.findUnique({
        where: { id: postId },
    });

    if (!existingPost) {
        return c.json({ error: "Post not found" }, 404);
    }

    // Check ownership
    const isOwner = existingPost.authorId === user.id;
    const isAdmin = user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
    }

    // Generate new slug if title changed
    let slug = existingPost.slug;
    if (data.title && data.title !== existingPost.title) {
        slug = await generateUniqueSlug(data.title, postId);
    }

    // Sanitize content
    const sanitizedTitle = data.title ? sanitizeText(data.title) : undefined;
    const sanitizedContent = data.content ? sanitizeMarkdown(data.content) : undefined;
    const sanitizedExcerpt = data.excerpt ? sanitizeText(data.excerpt) : undefined;

    // Update post and tags atomically
    const updatedPost = await prisma.$transaction(async (tx) => {
        let tagUpdate = {};
        if (data.tags) {
            await tx.postTag.deleteMany({
                where: { postId },
            });

            const tagConnections = [];
            for (const tagName of data.tags) {
                let tag = await tx.tag.findFirst({
                    where: { name: { equals: tagName, mode: "insensitive" } },
                });

                if (!tag) {
                    const tagSlug = await generateUniqueTagSlug(tagName);
                    tag = await tx.tag.create({
                        data: {
                            name: tagName,
                            slug: tagSlug,
                        },
                    });
                }

                tagConnections.push({ tagId: tag.id });
            }

            tagUpdate = {
                tags: {
                    create: tagConnections,
                },
            };
        }

        return tx.post.update({
            where: { id: postId },
            data: {
                title: sanitizedTitle,
                slug,
                content: sanitizedContent,
                excerpt: sanitizedExcerpt,
                coverImage: data.coverImage,
                isFeatured: data.isFeatured,
                ...tagUpdate,
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                tags: {
                    include: {
                        tag: true,
                    },
                },
            },
        });
    });

    return c.json({
        ...updatedPost,
        tags: updatedPost.tags.map((pt) => pt.tag),
    });
});

// ============================================
// DELETE POST (Owner or ADMIN only)
// ============================================
posts.delete("/:id", requireAuth, async (c) => {
    const postId = c.req.param("id");
    const user = c.get("user");

    const existingPost = await prisma.post.findUnique({
        where: { id: postId },
    });

    if (!existingPost) {
        return c.json({ error: "Post not found" }, 404);
    }

    const isOwner = existingPost.authorId === user.id;
    const isAdmin = user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
    }

    await prisma.post.delete({
        where: { id: postId },
    });

    return c.json({ message: "Post deleted successfully" });
});

export default posts;
