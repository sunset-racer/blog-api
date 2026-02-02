import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
// mockReset removed - using vi.clearAllMocks in setup
import type { Tag } from "../../../generated/prisma/client.js";
import {
    setupAdminAuth,
    setupReaderAuth,
    setupUnauthenticated,
    mockAuth,
} from "../../setup/mocks/auth";
import { prismaMock } from "../../setup/mocks/prisma";

// Mock slug utility to avoid Prisma issues
vi.mock("@/utils/slug", () => ({
    generateUniqueTagSlug: vi.fn((name: string) => Promise.resolve(name.toLowerCase().replace(/\s+/g, "-"))),
    slugify: vi.fn((text: string) => text.toLowerCase().replace(/\s+/g, "-")),
}));

// Import after mocks are registered by setup
import { createTagsRoute } from "../../../src/routes/tags";

// Helper to create test app
const createApp = () => {
    const app = new Hono();
    const tagsRoute = createTagsRoute(prismaMock, mockAuth);
    app.route("/api/tags", tagsRoute);
    return app;
};

// Mock tag factory
const createMockTag = (overrides: Partial<Tag> = {}): Tag => ({
    id: "cltag1234567890123456789",
    name: "JavaScript",
    slug: "javascript",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

describe("Tags Route", () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        // Mock reset handled by setup
        vi.clearAllMocks();
        app = createApp();
    });

    describe("GET /api/tags", () => {
        it("should return all tags with post counts", async () => {
            const mockTags = [
                { ...createMockTag(), _count: { posts: 5 } },
                { ...createMockTag({ id: "tag2", name: "TypeScript", slug: "typescript" }), _count: { posts: 3 } },
            ];
            prismaMock.tag.findMany.mockResolvedValue(mockTags as never);

            const res = await app.request("/api/tags");
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.tags).toHaveLength(2);
            expect(body.tags[0].name).toBe("JavaScript");
            expect(body.tags[0]._count.posts).toBe(5);
        });

        it("should return empty array when no tags exist", async () => {
            prismaMock.tag.findMany.mockResolvedValue([]);

            const res = await app.request("/api/tags");
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.tags).toEqual([]);
        });
    });

    describe("GET /api/tags/:slug", () => {
        it("should return tag with published posts", async () => {
            const mockTag = {
                ...createMockTag(),
                posts: [
                    {
                        post: {
                            id: "post1",
                            title: "Test Post",
                            slug: "test-post",
                            excerpt: "Test excerpt",
                            coverImage: null,
                            publishedAt: new Date(),
                            viewCount: 10,
                            author: { id: "author1", name: "Author", image: null },
                        },
                    },
                ],
                _count: { posts: 1 },
            };
            prismaMock.tag.findUnique.mockResolvedValue(mockTag as never);

            const res = await app.request("/api/tags/javascript");
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.name).toBe("JavaScript");
            expect(body.posts).toHaveLength(1);
            expect(body.posts[0].title).toBe("Test Post");
        });

        it("should return 404 for non-existent tag", async () => {
            prismaMock.tag.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/tags/nonexistent");
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Tag not found");
        });
    });

    describe("POST /api/tags", () => {
        it("should create tag when admin is authenticated", async () => {
            setupAdminAuth();
            const newTag = createMockTag({ name: "React", slug: "react" });

            prismaMock.tag.findFirst.mockResolvedValue(null); // No duplicate
            prismaMock.tag.create.mockResolvedValue(newTag);

            const res = await app.request("/api/tags", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "React" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(201);
            expect(body.name).toBe("React");
            expect(body.slug).toBe("react");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "React" }),
            });

            expect(res.status).toBe(401);
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/tags", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "React" }),
            });

            expect(res.status).toBe(403);
        });

        it("should return 400 when tag name already exists", async () => {
            setupAdminAuth();
            prismaMock.tag.findFirst.mockResolvedValue(createMockTag() as never);

            const res = await app.request("/api/tags", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "JavaScript" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Tag with this name already exists");
        });

        it("should return 400 for invalid body", async () => {
            setupAdminAuth();

            const res = await app.request("/api/tags", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "" }), // Empty name
            });

            expect(res.status).toBe(400);
        });
    });

    describe("PUT /api/tags/:id", () => {
        it("should update tag when admin is authenticated", async () => {
            setupAdminAuth();
            const existingTag = createMockTag();
            const updatedTag = { ...existingTag, name: "JavaScript ES6", slug: "javascript-es6" };

            prismaMock.tag.findUnique.mockResolvedValue(existingTag);
            prismaMock.tag.findFirst.mockResolvedValue(null); // No duplicate
            prismaMock.tag.update.mockResolvedValue(updatedTag);

            const res = await app.request(`/api/tags/${existingTag.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "JavaScript ES6" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.name).toBe("JavaScript ES6");
        });

        it("should return 404 when tag not found", async () => {
            setupAdminAuth();
            prismaMock.tag.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/tags/nonexistent-id", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "Updated Name" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Tag not found");
        });

        it("should return 400 when duplicate name exists", async () => {
            setupAdminAuth();
            const existingTag = createMockTag();
            const duplicateTag = createMockTag({ id: "different-id", name: "TypeScript" });

            prismaMock.tag.findUnique.mockResolvedValue(existingTag);
            prismaMock.tag.findFirst.mockResolvedValue(duplicateTag as never);

            const res = await app.request(`/api/tags/${existingTag.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "TypeScript" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Tag with this name already exists");
        });
    });

    describe("DELETE /api/tags/:id", () => {
        it("should delete tag when admin and no posts associated", async () => {
            setupAdminAuth();
            const tag = { ...createMockTag(), _count: { posts: 0 } };

            prismaMock.tag.findUnique.mockResolvedValue(tag as never);
            prismaMock.tag.delete.mockResolvedValue(tag);

            const res = await app.request(`/api/tags/${tag.id}`, {
                method: "DELETE",
                headers: {
                    Cookie: "better-auth.session_token=test-token",
                },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.message).toBe("Tag deleted successfully");
        });

        it("should return 400 when tag has associated posts", async () => {
            setupAdminAuth();
            const tag = { ...createMockTag(), _count: { posts: 5 } };

            prismaMock.tag.findUnique.mockResolvedValue(tag as never);

            const res = await app.request(`/api/tags/${tag.id}`, {
                method: "DELETE",
                headers: {
                    Cookie: "better-auth.session_token=test-token",
                },
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Cannot delete tag with associated posts");
            expect(body.postsCount).toBe(5);
        });

        it("should return 404 when tag not found", async () => {
            setupAdminAuth();
            prismaMock.tag.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/tags/nonexistent-id", {
                method: "DELETE",
                headers: {
                    Cookie: "better-auth.session_token=test-token",
                },
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("Tag not found");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/tags/some-id", {
                method: "DELETE",
            });

            expect(res.status).toBe(401);
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/tags/some-id", {
                method: "DELETE",
                headers: {
                    Cookie: "better-auth.session_token=test-token",
                },
            });

            expect(res.status).toBe(403);
        });
    });
});
