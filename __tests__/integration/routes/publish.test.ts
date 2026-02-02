import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
// mockReset removed - using vi.clearAllMocks in setup
import type { Post, PublishRequest } from "../../../generated/prisma/client.js";
import { PostStatus, PublishRequestStatus, Role } from "../../../generated/prisma/client.js";
import {
    setupAdminAuth,
    setupAuthorAuth,
    setupReaderAuth,
    setupUnauthenticated,
    mockAdminSession,
    mockAuthorSession,
    mockAuth,
} from "../../setup/mocks/auth";
import { prismaMock } from "../../setup/mocks/prisma";

// Import after mocks are registered by setup
import { createPublishRoute } from "../../../src/routes/publish";

// Helper to create test app
const createApp = () => {
    const app = new Hono();
    const publishRoute = createPublishRoute(prismaMock, mockAuth);
    app.route("/api/publish", publishRoute);
    return app;
};

// Mock factories
const createMockPost = (overrides: Partial<Post> = {}): Post => ({
    id: "clpost123456789012345678",
    title: "Test Post",
    slug: "test-post",
    content: "Test content",
    excerpt: "Test excerpt",
    coverImage: null,
    status: PostStatus.DRAFT,
    viewCount: 0,
    isFeatured: false,
    publishedAt: null,
    authorId: "clauthor12345678901234567",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
});

const createMockPublishRequest = (overrides: Partial<PublishRequest> = {}): PublishRequest => ({
    id: "clreq1234567890123456789",
    postId: "clpost123456789012345678",
    authorId: "clauthor12345678901234567",
    status: PublishRequestStatus.PENDING,
    message: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
});

describe("Publish Route", () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        // Mock reset handled by setup
        vi.clearAllMocks();
        app = createApp();
    });

    describe("POST /api/publish/posts/:postId/request", () => {
        it("should create publish request for author's draft post", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const post = createMockPost({ authorId: authorSession.user.id });
            const publishRequest = {
                ...createMockPublishRequest({ authorId: authorSession.user.id }),
                post: { id: post.id, title: post.title, slug: post.slug },
                author: { id: authorSession.user.id, name: "Author", email: "author@example.com" },
            };

            prismaMock.post.findUnique.mockResolvedValue(post);
            prismaMock.publishRequest.findFirst.mockResolvedValue(null);
            prismaMock.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    publishRequest: { create: vi.fn().mockResolvedValue(publishRequest) },
                    post: { update: vi.fn() },
                });
            });

            const res = await app.request(`/api/publish/posts/${post.id}/request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ message: "Please review my post" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(201);
            expect(body.status).toBe(PublishRequestStatus.PENDING);
        });

        it("should return 404 when post not found", async () => {
            setupAuthorAuth();
            prismaMock.post.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/publish/posts/nonexistent/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Post not found");
        });

        it("should return 403 when user is not the author", async () => {
            setupAuthorAuth();
            const post = createMockPost({ authorId: "different-author-id" });
            prismaMock.post.findUnique.mockResolvedValue(post);

            const res = await app.request(`/api/publish/posts/${post.id}/request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(403);
            expect(body.error).toBe("Forbidden");
        });

        it("should return 400 when post is not a draft", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const post = createMockPost({
                authorId: authorSession.user.id,
                status: PostStatus.PUBLISHED,
            });
            prismaMock.post.findUnique.mockResolvedValue(post);

            const res = await app.request(`/api/publish/posts/${post.id}/request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Only draft posts can request publishing");
        });

        it("should return 400 when pending request already exists", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const post = createMockPost({ authorId: authorSession.user.id });
            prismaMock.post.findUnique.mockResolvedValue(post);
            prismaMock.publishRequest.findFirst.mockResolvedValue(createMockPublishRequest());

            const res = await app.request(`/api/publish/posts/${post.id}/request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("A publish request is already pending for this post");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/publish/posts/some-id/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(401);
        });

        it("should return 403 when user is reader", async () => {
            setupReaderAuth();

            const res = await app.request("/api/publish/posts/some-id/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(403);
        });
    });

    describe("GET /api/publish/requests", () => {
        it("should return all publish requests for admin", async () => {
            setupAdminAuth();
            const mockRequests = [
                {
                    ...createMockPublishRequest(),
                    post: { id: "post1", title: "Post 1", slug: "post-1", excerpt: null, coverImage: null, createdAt: new Date(), updatedAt: new Date() },
                    author: { id: "author1", name: "Author", email: "author@example.com", image: null },
                },
            ];
            prismaMock.publishRequest.findMany.mockResolvedValue(mockRequests as never);

            const res = await app.request("/api/publish/requests", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.requests).toHaveLength(1);
        });

        it("should return 403 when user is not admin", async () => {
            setupAuthorAuth();

            const res = await app.request("/api/publish/requests", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(403);
        });

        it("should support filtering by status", async () => {
            setupAdminAuth();
            prismaMock.publishRequest.findMany.mockResolvedValue([]);

            const res = await app.request("/api/publish/requests?status=PENDING", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(200);
        });
    });

    describe("GET /api/publish/my-requests", () => {
        it("should return user's own publish requests", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const mockRequests = [
                {
                    ...createMockPublishRequest({ authorId: authorSession.user.id }),
                    post: { id: "post1", title: "Post 1", slug: "post-1", status: PostStatus.PENDING_APPROVAL },
                },
            ];
            prismaMock.publishRequest.findMany.mockResolvedValue(mockRequests as never);

            const res = await app.request("/api/publish/my-requests", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.requests).toHaveLength(1);
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/publish/my-requests");

            expect(res.status).toBe(401);
        });
    });

    describe("POST /api/publish/requests/:requestId/approve", () => {
        it("should approve publish request when admin", async () => {
            setupAdminAuth();
            const request = {
                ...createMockPublishRequest(),
                post: createMockPost(),
            };
            const approvedRequest = {
                ...request,
                status: PublishRequestStatus.APPROVED,
                post: { id: request.post.id, title: request.post.title, slug: request.post.slug },
                author: { id: "author1", name: "Author", email: "author@example.com" },
            };

            prismaMock.publishRequest.findUnique.mockResolvedValue(request as never);
            prismaMock.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    publishRequest: { update: vi.fn().mockResolvedValue(approvedRequest) },
                    post: { update: vi.fn() },
                });
            });

            const res = await app.request(`/api/publish/requests/${request.id}/approve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ message: "Approved!" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe(PublishRequestStatus.APPROVED);
        });

        it("should return 404 when request not found", async () => {
            setupAdminAuth();
            prismaMock.publishRequest.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/publish/requests/nonexistent/approve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Publish request not found");
        });

        it("should return 400 when request is already processed", async () => {
            setupAdminAuth();
            const request = {
                ...createMockPublishRequest({ status: PublishRequestStatus.APPROVED }),
                post: createMockPost(),
            };
            prismaMock.publishRequest.findUnique.mockResolvedValue(request as never);

            const res = await app.request(`/api/publish/requests/${request.id}/approve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("This request has already been processed");
        });

        it("should return 403 when user is not admin", async () => {
            setupAuthorAuth();

            const res = await app.request("/api/publish/requests/some-id/approve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(403);
        });
    });

    describe("POST /api/publish/requests/:requestId/reject", () => {
        it("should reject publish request when admin", async () => {
            setupAdminAuth();
            const request = createMockPublishRequest();
            const rejectedRequest = {
                ...request,
                status: PublishRequestStatus.REJECTED,
                message: "Needs more work",
                post: { id: "post1", title: "Post 1", slug: "post-1" },
                author: { id: "author1", name: "Author", email: "author@example.com" },
            };

            prismaMock.publishRequest.findUnique.mockResolvedValue(request);
            prismaMock.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    publishRequest: { update: vi.fn().mockResolvedValue(rejectedRequest) },
                    post: { update: vi.fn() },
                });
            });

            const res = await app.request(`/api/publish/requests/${request.id}/reject`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ message: "Needs more work" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe(PublishRequestStatus.REJECTED);
        });

        it("should return 404 when request not found", async () => {
            setupAdminAuth();
            prismaMock.publishRequest.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/publish/requests/nonexistent/reject", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ message: "Rejected" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Publish request not found");
        });

        it("should return 400 when request is already processed", async () => {
            setupAdminAuth();
            const request = createMockPublishRequest({ status: PublishRequestStatus.REJECTED });
            prismaMock.publishRequest.findUnique.mockResolvedValue(request);

            const res = await app.request(`/api/publish/requests/${request.id}/reject`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ message: "Rejected" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("This request has already been processed");
        });
    });

    describe("DELETE /api/publish/requests/:requestId", () => {
        it("should cancel pending request when owner", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const request = createMockPublishRequest({ authorId: authorSession.user.id });

            prismaMock.publishRequest.findUnique.mockResolvedValue(request);
            prismaMock.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    publishRequest: { delete: vi.fn() },
                    post: { update: vi.fn() },
                });
            });

            const res = await app.request(`/api/publish/requests/${request.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.message).toBe("Publish request cancelled successfully");
        });

        it("should return 404 when request not found", async () => {
            setupAuthorAuth();
            prismaMock.publishRequest.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/publish/requests/nonexistent", {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Publish request not found");
        });

        it("should return 403 when user is not owner", async () => {
            setupAuthorAuth();
            const request = createMockPublishRequest({ authorId: "different-author-id" });
            prismaMock.publishRequest.findUnique.mockResolvedValue(request);

            const res = await app.request(`/api/publish/requests/${request.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(403);
            expect(body.error).toBe("Forbidden");
        });

        it("should return 400 when request is not pending", async () => {
            const authorSession = mockAuthorSession();
            setupAuthorAuth();
            const request = createMockPublishRequest({
                authorId: authorSession.user.id,
                status: PublishRequestStatus.APPROVED,
            });
            prismaMock.publishRequest.findUnique.mockResolvedValue(request);

            const res = await app.request(`/api/publish/requests/${request.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Only pending requests can be cancelled");
        });

        it("should allow admin to cancel any request", async () => {
            setupAdminAuth();
            const request = createMockPublishRequest({ authorId: "different-author-id" });

            prismaMock.publishRequest.findUnique.mockResolvedValue(request);
            prismaMock.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    publishRequest: { delete: vi.fn() },
                    post: { update: vi.fn() },
                });
            });

            const res = await app.request(`/api/publish/requests/${request.id}`, {
                method: "DELETE",
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.message).toBe("Publish request cancelled successfully");
        });
    });
});
