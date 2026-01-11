import { z } from "zod";

// ============================================
// POST SCHEMAS
// ============================================

export const createPostSchema = z.object({
    title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
    content: z.string().min(1, "Content is required"),
    excerpt: z.string().max(500, "Excerpt must be less than 500 characters").optional(),
    coverImage: z.string().url("Cover image must be a valid URL").optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
});

export const updatePostSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).optional(),
    excerpt: z.string().max(500).optional(),
    coverImage: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
});

export const publishPostSchema = z.object({
    message: z.string().max(1000, "Message must be less than 1000 characters").optional(),
});

export const getPostsQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    status: z.enum(["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"]).optional(),
    authorId: z.string().optional(),
    tagSlug: z.string().optional(),
    isFeatured: z.coerce.boolean().optional(),
    search: z.string().optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "viewCount", "title"]).optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

// ============================================
// TAG SCHEMAS
// ============================================

export const createTagSchema = z.object({
    name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters"),
});

export const updateTagSchema = z.object({
    name: z.string().min(1).max(50),
});

// ============================================
// COMMENT SCHEMAS
// ============================================

export const createCommentSchema = z.object({
    content: z.string().min(1, "Comment content is required").max(2000, "Comment must be less than 2000 characters"),
});

export const updateCommentSchema = z.object({
    content: z.string().min(1).max(2000),
});

// ============================================
// PUBLISH REQUEST SCHEMAS
// ============================================

export const approvePublishRequestSchema = z.object({
    message: z.string().max(1000).optional(),
});

export const rejectPublishRequestSchema = z.object({
    message: z.string().min(1, "Rejection reason is required").max(1000),
});

// Type exports
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PublishPostInput = z.infer<typeof publishPostSchema>;
export type GetPostsQuery = z.infer<typeof getPostsQuerySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ApprovePublishRequestInput = z.infer<typeof approvePublishRequestSchema>;
export type RejectPublishRequestInput = z.infer<typeof rejectPublishRequestSchema>;
