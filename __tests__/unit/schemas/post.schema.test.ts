import { describe, it, expect } from "vitest";
import {
    createPostSchema,
    updatePostSchema,
    publishPostSchema,
    getPostsQuerySchema,
    createTagSchema,
    updateTagSchema,
    createCommentSchema,
    updateCommentSchema,
    getCommentsQuerySchema,
    approvePublishRequestSchema,
    rejectPublishRequestSchema,
    getPublishRequestsQuerySchema,
} from "../../../src/schemas/post.schema";

describe("post.schema", () => {
    describe("createPostSchema", () => {
        it("should validate valid post data", () => {
            const validPost = {
                title: "My Blog Post",
                content: "This is the content of the post.",
            };

            const result = createPostSchema.safeParse(validPost);
            expect(result.success).toBe(true);
        });

        it("should validate with all optional fields", () => {
            const fullPost = {
                title: "My Blog Post",
                content: "Content here",
                excerpt: "A short excerpt",
                coverImage: "https://example.com/image.jpg",
                tags: ["javascript", "react"],
                isFeatured: true,
            };

            const result = createPostSchema.safeParse(fullPost);
            expect(result.success).toBe(true);
        });

        it("should reject empty title", () => {
            const result = createPostSchema.safeParse({
                title: "",
                content: "Some content",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Title is required");
            }
        });

        it("should reject missing title", () => {
            const result = createPostSchema.safeParse({
                content: "Some content",
            });

            expect(result.success).toBe(false);
        });

        it("should reject title exceeding 200 characters", () => {
            const result = createPostSchema.safeParse({
                title: "a".repeat(201),
                content: "Content",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Title must be less than 200 characters");
            }
        });

        it("should reject empty content", () => {
            const result = createPostSchema.safeParse({
                title: "Title",
                content: "",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Content is required");
            }
        });

        it("should reject excerpt exceeding 500 characters", () => {
            const result = createPostSchema.safeParse({
                title: "Title",
                content: "Content",
                excerpt: "a".repeat(501),
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Excerpt must be less than 500 characters");
            }
        });

        it("should reject invalid coverImage URL", () => {
            const result = createPostSchema.safeParse({
                title: "Title",
                content: "Content",
                coverImage: "not-a-url",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Cover image must be a valid URL");
            }
        });

        it("should reject non-array tags", () => {
            const result = createPostSchema.safeParse({
                title: "Title",
                content: "Content",
                tags: "javascript",
            });

            expect(result.success).toBe(false);
        });

        it("should reject non-boolean isFeatured", () => {
            const result = createPostSchema.safeParse({
                title: "Title",
                content: "Content",
                isFeatured: "yes",
            });

            expect(result.success).toBe(false);
        });
    });

    describe("updatePostSchema", () => {
        it("should validate partial update data", () => {
            const result = updatePostSchema.safeParse({
                title: "Updated Title",
            });

            expect(result.success).toBe(true);
        });

        it("should validate empty object (no fields to update)", () => {
            const result = updatePostSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should validate all fields", () => {
            const result = updatePostSchema.safeParse({
                title: "Updated",
                content: "Updated content",
                excerpt: "Updated excerpt",
                coverImage: "https://example.com/new.jpg",
                tags: ["updated"],
                isFeatured: false,
            });

            expect(result.success).toBe(true);
        });

        it("should reject empty title when provided", () => {
            const result = updatePostSchema.safeParse({
                title: "",
            });

            expect(result.success).toBe(false);
        });

        it("should reject invalid URL for coverImage", () => {
            const result = updatePostSchema.safeParse({
                coverImage: "invalid",
            });

            expect(result.success).toBe(false);
        });
    });

    describe("publishPostSchema", () => {
        it("should validate empty object", () => {
            const result = publishPostSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should validate with message", () => {
            const result = publishPostSchema.safeParse({
                message: "Please review this post",
            });

            expect(result.success).toBe(true);
        });

        it("should reject message exceeding 1000 characters", () => {
            const result = publishPostSchema.safeParse({
                message: "a".repeat(1001),
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Message must be less than 1000 characters");
            }
        });
    });

    describe("getPostsQuerySchema", () => {
        it("should provide defaults for empty query", () => {
            const result = getPostsQuerySchema.safeParse({});

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.limit).toBe(10);
                expect(result.data.sortBy).toBe("createdAt");
                expect(result.data.sortOrder).toBe("desc");
            }
        });

        it("should coerce string page to number", () => {
            const result = getPostsQuerySchema.safeParse({ page: "5" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(5);
            }
        });

        it("should validate status enum values", () => {
            const validStatuses = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"];

            for (const status of validStatuses) {
                const result = getPostsQuerySchema.safeParse({ status });
                expect(result.success).toBe(true);
            }
        });

        it("should reject invalid status", () => {
            const result = getPostsQuerySchema.safeParse({ status: "INVALID" });
            expect(result.success).toBe(false);
        });

        it("should reject negative page", () => {
            const result = getPostsQuerySchema.safeParse({ page: -1 });
            expect(result.success).toBe(false);
        });

        it("should reject limit exceeding 100", () => {
            const result = getPostsQuerySchema.safeParse({ limit: 101 });
            expect(result.success).toBe(false);
        });

        it("should validate sortBy options", () => {
            const validSortBy = ["createdAt", "updatedAt", "publishedAt", "viewCount", "title"];

            for (const sortBy of validSortBy) {
                const result = getPostsQuerySchema.safeParse({ sortBy });
                expect(result.success).toBe(true);
            }
        });

        it("should reject invalid sortBy", () => {
            const result = getPostsQuerySchema.safeParse({ sortBy: "invalid" });
            expect(result.success).toBe(false);
        });

        it("should validate sortOrder options", () => {
            expect(getPostsQuerySchema.safeParse({ sortOrder: "asc" }).success).toBe(true);
            expect(getPostsQuerySchema.safeParse({ sortOrder: "desc" }).success).toBe(true);
        });

        it("should coerce isFeatured string to boolean", () => {
            const result = getPostsQuerySchema.safeParse({ isFeatured: "true" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isFeatured).toBe(true);
            }
        });
    });

    describe("createTagSchema", () => {
        it("should validate valid tag name", () => {
            const result = createTagSchema.safeParse({ name: "JavaScript" });
            expect(result.success).toBe(true);
        });

        it("should reject empty tag name", () => {
            const result = createTagSchema.safeParse({ name: "" });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Tag name is required");
            }
        });

        it("should reject tag name exceeding 50 characters", () => {
            const result = createTagSchema.safeParse({ name: "a".repeat(51) });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Tag name must be less than 50 characters");
            }
        });
    });

    describe("updateTagSchema", () => {
        it("should validate valid update", () => {
            const result = updateTagSchema.safeParse({ name: "Updated Tag" });
            expect(result.success).toBe(true);
        });

        it("should reject empty name", () => {
            const result = updateTagSchema.safeParse({ name: "" });
            expect(result.success).toBe(false);
        });

        it("should reject name exceeding 50 characters", () => {
            const result = updateTagSchema.safeParse({ name: "a".repeat(51) });
            expect(result.success).toBe(false);
        });
    });

    describe("createCommentSchema", () => {
        it("should validate valid comment", () => {
            const result = createCommentSchema.safeParse({
                content: "Great post!",
            });

            expect(result.success).toBe(true);
        });

        it("should reject empty content", () => {
            const result = createCommentSchema.safeParse({ content: "" });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Comment content is required");
            }
        });

        it("should reject content exceeding 2000 characters", () => {
            const result = createCommentSchema.safeParse({
                content: "a".repeat(2001),
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Comment must be less than 2000 characters");
            }
        });
    });

    describe("updateCommentSchema", () => {
        it("should validate valid update", () => {
            const result = updateCommentSchema.safeParse({
                content: "Updated comment",
            });

            expect(result.success).toBe(true);
        });

        it("should reject empty content", () => {
            const result = updateCommentSchema.safeParse({ content: "" });
            expect(result.success).toBe(false);
        });

        it("should reject content exceeding 2000 characters", () => {
            const result = updateCommentSchema.safeParse({
                content: "a".repeat(2001),
            });

            expect(result.success).toBe(false);
        });
    });

    describe("getCommentsQuerySchema", () => {
        it("should provide defaults for empty query", () => {
            const result = getCommentsQuerySchema.safeParse({});

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.limit).toBe(20);
            }
        });

        it("should validate with all optional fields", () => {
            const result = getCommentsQuerySchema.safeParse({
                search: "test",
                authorId: "author-123",
                postId: "post-456",
                page: 2,
                limit: 50,
            });

            expect(result.success).toBe(true);
        });

        it("should reject limit exceeding 100", () => {
            const result = getCommentsQuerySchema.safeParse({ limit: 101 });
            expect(result.success).toBe(false);
        });
    });

    describe("approvePublishRequestSchema", () => {
        it("should validate empty object", () => {
            const result = approvePublishRequestSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should validate with message", () => {
            const result = approvePublishRequestSchema.safeParse({
                message: "Approved! Great content.",
            });

            expect(result.success).toBe(true);
        });

        it("should reject message exceeding 1000 characters", () => {
            const result = approvePublishRequestSchema.safeParse({
                message: "a".repeat(1001),
            });

            expect(result.success).toBe(false);
        });
    });

    describe("rejectPublishRequestSchema", () => {
        it("should validate with message", () => {
            const result = rejectPublishRequestSchema.safeParse({
                message: "Please revise the introduction",
            });

            expect(result.success).toBe(true);
        });

        it("should reject empty message", () => {
            const result = rejectPublishRequestSchema.safeParse({ message: "" });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Rejection reason is required");
            }
        });

        it("should reject missing message", () => {
            const result = rejectPublishRequestSchema.safeParse({});
            expect(result.success).toBe(false);
        });

        it("should reject message exceeding 1000 characters", () => {
            const result = rejectPublishRequestSchema.safeParse({
                message: "a".repeat(1001),
            });

            expect(result.success).toBe(false);
        });
    });

    describe("getPublishRequestsQuerySchema", () => {
        it("should validate empty query", () => {
            const result = getPublishRequestsQuerySchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should validate status values", () => {
            const validStatuses = ["PENDING", "APPROVED", "REJECTED"];

            for (const status of validStatuses) {
                const result = getPublishRequestsQuerySchema.safeParse({ status });
                expect(result.success).toBe(true);
            }
        });

        it("should reject invalid status", () => {
            const result = getPublishRequestsQuerySchema.safeParse({
                status: "INVALID",
            });

            expect(result.success).toBe(false);
        });

        it("should validate with authorId", () => {
            const result = getPublishRequestsQuerySchema.safeParse({
                authorId: "author-123",
            });

            expect(result.success).toBe(true);
        });
    });
});
