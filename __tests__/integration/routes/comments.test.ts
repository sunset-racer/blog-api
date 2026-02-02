import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
// mockReset removed - using vi.clearAllMocks in setup
import type { Comment } from "../../../generated/prisma/client.js";
import { PostStatus } from "../../../generated/prisma/client.js";
import {
    setupAdminAuth,
    setupReaderAuth,
    setupUnauthenticated,
    mockReaderSession,
    mockAuth,
} from "../../setup/mocks/auth";
import { prismaMock } from "../../setup/mocks/prisma";

// Mock sanitize utility
vi.mock("@/utils/sanitize", () => ({
    escapeHtml: vi.fn((text: string) => text),
}));

// Import after mocks are registered by setup
import { createCommentsRoute } from "../../../src/routes/comments";

// Helper to create test app
const createApp = () => {
    const app = new Hono();
    const commentsRoute = createCommentsRoute(prismaMock, mockAuth);
    app.route("/api/comments", commentsRoute);
    return app;
};

// Mock factories
const createMockComment = (overrides: Partial<Comment> = {}): Comment => ({
    id: "clcomm123456789012345678",
    content: "This is a test comment",
    postId: "clpost123456789012345678",
    authorId: "cluser123456789012345678",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
});

const createMockAuthor = () => ({
    id: "cluser123456789012345678",
    name: "Test User",
    image: null,
});

describe("Comments Route", () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        // Mock reset handled by setup
        vi.clearAllMocks();
        app = createApp();
    });

    describe("GET /api/comments/all", () => {
        it("should return all comments for admin", async () => {
            setupAdminAuth();
            const mockComments = [
                {
                    ...createMockComment(),
                    author: createMockAuthor(),
                    post: { id: "post1", title: "Test Post", slug: "test-post", status: PostStatus.PUBLISHED },
                },
            ];
            prismaMock.comment.findMany.mockResolvedValue(mockComments as never);
            prismaMock.comment.count.mockResolvedValue(1);

            const res = await app.request("/api/comments/all", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.comments).toHaveLength(1);
            expect(body.pagination).toBeDefined();
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/comments/all");

            expect(res.status).toBe(401);
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/comments/all", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(403);
        });

        it("should support search and filtering", async () => {
            setupAdminAuth();
            prismaMock.comment.findMany.mockResolvedValue([]);
            prismaMock.comment.count.mockResolvedValue(0);

            const res = await app.request("/api/comments/all?search=test&postId=post123", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(200);
        });
    });

    describe("GET /api/comments/my-comments", () => {
        it("should return comments by current user", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            const mockComments = [
                {
                    ...createMockComment({ authorId: readerSession.user.id }),
                    author: createMockAuthor(),
                    post: { id: "post1", title: "Test Post", slug: "test-post", status: PostStatus.PUBLISHED },
                },
            ];
            prismaMock.comment.findMany.mockResolvedValue(mockComments as never);

            const res = await app.request("/api/comments/my-comments", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.comments).toHaveLength(1);
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/comments/my-comments");

            expect(res.status).toBe(401);
        });
    });

    describe("GET /api/comments/posts/:postId", () => {
        it("should return comments for published post", async () => {
            setupUnauthenticated();
            prismaMock.post.findUnique.mockResolvedValue({
                status: PostStatus.PUBLISHED,
                authorId: "author1",
            } as never);
            const mockComments = [
                { ...createMockComment(), author: createMockAuthor() },
            ];
            prismaMock.comment.findMany.mockResolvedValue(mockComments as never);

            const res = await app.request("/api/comments/posts/post123");
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.comments).toHaveLength(1);
        });

        it("should return 404 when post not found", async () => {
            setupUnauthenticated();
            prismaMock.post.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/comments/posts/nonexistent");
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Post not found");
        });

        it("should return 404 for draft post when unauthenticated", async () => {
            setupUnauthenticated();
            prismaMock.post.findUnique.mockResolvedValue({
                status: PostStatus.DRAFT,
                authorId: "author1",
            } as never);

            const res = await app.request("/api/comments/posts/draft-post");
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Post not found");
        });

        it("should allow admin to see comments on draft post", async () => {
            setupAdminAuth();
            prismaMock.post.findUnique.mockResolvedValue({
                status: PostStatus.DRAFT,
                authorId: "different-author",
            } as never);
            prismaMock.comment.findMany.mockResolvedValue([]);

            const res = await app.request("/api/comments/posts/draft-post", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(200);
        });
    });

    describe("POST /api/comments/posts/:postId", () => {
        it("should create comment on published post", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            prismaMock.post.findUnique.mockResolvedValue({
                status: PostStatus.PUBLISHED,
            } as never);
            const newComment = {
                ...createMockComment({ authorId: readerSession.user.id }),
                author: createMockAuthor(),
            };
            prismaMock.comment.create.mockResolvedValue(newComment as never);

            const res = await app.request("/api/comments/posts/post123", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Great post!" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(201);
            expect(body.content).toBe("This is a test comment");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/comments/posts/post123", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: "Comment" }),
            });

            expect(res.status).toBe(401);
        });

        it("should return 404 when post not found", async () => {
            setupReaderAuth();
            prismaMock.post.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/comments/posts/nonexistent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Comment" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Post not found");
        });

        it("should return 400 when commenting on draft post", async () => {
            setupReaderAuth();
            prismaMock.post.findUnique.mockResolvedValue({
                status: PostStatus.DRAFT,
            } as never);

            const res = await app.request("/api/comments/posts/draft-post", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Comment" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Cannot comment on unpublished posts");
        });

        it("should return 400 for invalid body", async () => {
            setupReaderAuth();

            const res = await app.request("/api/comments/posts/post123", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "" }), // Empty content
            });

            expect(res.status).toBe(400);
        });
    });

    describe("PUT /api/comments/:id", () => {
        it("should update comment when owner", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            const existingComment = createMockComment({ authorId: readerSession.user.id });
            const updatedComment = {
                ...existingComment,
                content: "Updated comment",
                author: createMockAuthor(),
            };

            prismaMock.comment.findUnique.mockResolvedValue(existingComment);
            prismaMock.comment.update.mockResolvedValue(updatedComment as never);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Updated comment" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.content).toBe("Updated comment");
        });

        it("should return 404 when comment not found", async () => {
            setupReaderAuth();
            prismaMock.comment.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/comments/nonexistent", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Updated" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Comment not found");
        });

        it("should return 403 when user is not owner", async () => {
            setupReaderAuth();
            const existingComment = createMockComment({ authorId: "different-user-id" });
            prismaMock.comment.findUnique.mockResolvedValue(existingComment);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Updated" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(403);
            expect(body.error).toBe("Forbidden");
        });

        it("should allow admin to update any comment", async () => {
            setupAdminAuth();
            const existingComment = createMockComment({ authorId: "different-user-id" });
            const updatedComment = {
                ...existingComment,
                content: "Admin updated",
                author: createMockAuthor(),
            };

            prismaMock.comment.findUnique.mockResolvedValue(existingComment);
            prismaMock.comment.update.mockResolvedValue(updatedComment as never);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ content: "Admin updated" }),
            });

            expect(res.status).toBe(200);
        });
    });

    describe("DELETE /api/comments/:id", () => {
        it("should delete comment when owner", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            const existingComment = createMockComment({ authorId: readerSession.user.id });

            prismaMock.comment.findUnique.mockResolvedValue(existingComment);
            prismaMock.comment.delete.mockResolvedValue(existingComment);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.message).toBe("Comment deleted successfully");
        });

        it("should return 404 when comment not found", async () => {
            setupReaderAuth();
            prismaMock.comment.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/comments/nonexistent", {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Comment not found");
        });

        it("should return 403 when user is not owner", async () => {
            setupReaderAuth();
            const existingComment = createMockComment({ authorId: "different-user-id" });
            prismaMock.comment.findUnique.mockResolvedValue(existingComment);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(403);
            expect(body.error).toBe("Forbidden");
        });

        it("should allow admin to delete any comment", async () => {
            setupAdminAuth();
            const existingComment = createMockComment({ authorId: "different-user-id" });

            prismaMock.comment.findUnique.mockResolvedValue(existingComment);
            prismaMock.comment.delete.mockResolvedValue(existingComment);

            const res = await app.request(`/api/comments/${existingComment.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.message).toBe("Comment deleted successfully");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/comments/some-id", {
                method: "DELETE",
            });

            expect(res.status).toBe(401);
        });
    });
});
