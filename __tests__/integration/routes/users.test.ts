import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
// mockReset removed - using vi.clearAllMocks in setup
import type { User } from "../../../generated/prisma/client.js";
import { Role } from "../../../generated/prisma/client.js";
import {
    setupAdminAuth,
    setupReaderAuth,
    setupUnauthenticated,
    mockAdminSession,
    mockReaderSession,
    mockAuth,
} from "../../setup/mocks/auth";
import { prismaMock } from "../../setup/mocks/prisma";

// Mock sanitize utility
vi.mock("@/utils/sanitize", () => ({
    sanitizeText: vi.fn((text: string) => text),
    sanitizeUrl: vi.fn((url: string) => url || null),
}));

// Import after mocks
import { createUsersRoute } from "../../../src/routes/users";

// Helper to create test app
const createApp = () => {
    const app = new Hono();
    const usersRoute = createUsersRoute(prismaMock, mockAuth);
    app.route("/api/users", usersRoute);
    return app;
};

// Mock factories
const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: "cluser123456789012345678",
    email: "user@example.com",
    name: "Test User",
    role: Role.READER,
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
});

describe("Users Route", () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        // Mock reset handled by setup
        vi.clearAllMocks();
        app = createApp();
    });

    describe("GET /api/users/me", () => {
        it("should return current user profile", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            const mockUser = {
                ...createMockUser({ id: readerSession.user.id }),
                profile: { bio: "Test bio", website: "https://example.com" },
                _count: { posts: 5, comments: 10 },
            };
            prismaMock.user.findUnique.mockResolvedValue(mockUser as never);

            const res = await app.request("/api/users/me", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.name).toBe("Test User");
            expect(body.profile.bio).toBe("Test bio");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/users/me");

            expect(res.status).toBe(401);
        });

        it("should return 404 when user not found in database", async () => {
            setupReaderAuth();
            prismaMock.user.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/users/me", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("User not found");
        });
    });

    describe("PATCH /api/users/me", () => {
        it("should update current user profile", async () => {
            const readerSession = mockReaderSession();
            setupReaderAuth();
            const updatedUser = {
                ...createMockUser({ id: readerSession.user.id, name: "Updated Name" }),
                profile: { bio: "Updated bio", website: null },
                _count: { posts: 5, comments: 10 },
            };
            prismaMock.user.update.mockResolvedValue(updatedUser as never);

            const res = await app.request("/api/users/me", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "Updated Name", bio: "Updated bio" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.name).toBe("Updated Name");
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "New Name" }),
            });

            expect(res.status).toBe(401);
        });

        it("should return 400 for invalid data", async () => {
            setupReaderAuth();

            const res = await app.request("/api/users/me", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ name: "X" }), // Too short
            });

            expect(res.status).toBe(400);
        });
    });

    describe("GET /api/users", () => {
        it("should return all users for admin", async () => {
            setupAdminAuth();
            const mockUsers = [
                { ...createMockUser(), _count: { posts: 3, comments: 5 } },
                { ...createMockUser({ id: "user2", email: "user2@example.com" }), _count: { posts: 1, comments: 2 } },
            ];
            prismaMock.user.findMany.mockResolvedValue(mockUsers as never);
            prismaMock.user.count.mockResolvedValue(2);

            const res = await app.request("/api/users", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.users).toHaveLength(2);
            expect(body.pagination).toBeDefined();
        });

        it("should return 401 when not authenticated", async () => {
            setupUnauthenticated();

            const res = await app.request("/api/users");

            expect(res.status).toBe(401);
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/users", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(403);
        });

        it("should support search and filtering", async () => {
            setupAdminAuth();
            prismaMock.user.findMany.mockResolvedValue([]);
            prismaMock.user.count.mockResolvedValue(0);

            const res = await app.request("/api/users?search=john&role=AUTHOR", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(200);
        });
    });

    describe("GET /api/users/:id", () => {
        it("should return user by ID for admin", async () => {
            setupAdminAuth();
            const mockUser = {
                ...createMockUser(),
                profile: { bio: "Test bio", website: null },
                _count: { posts: 5, comments: 10 },
            };
            prismaMock.user.findUnique.mockResolvedValue(mockUser as never);

            const res = await app.request(`/api/users/${mockUser.id}`, {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.id).toBe(mockUser.id);
        });

        it("should return 404 when user not found", async () => {
            setupAdminAuth();
            prismaMock.user.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/users/nonexistent", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("User not found");
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/users/some-id", {
                headers: { Cookie: "better-auth.session_token=test-token" },
            });

            expect(res.status).toBe(403);
        });
    });

    describe("PATCH /api/users/:id/role", () => {
        it("should update user role when admin", async () => {
            const adminSession = mockAdminSession();
            setupAdminAuth();
            const targetUser = createMockUser({ id: "different-user-id" });
            const updatedUser = {
                ...targetUser,
                role: Role.AUTHOR,
                _count: { posts: 0, comments: 0 },
            };

            prismaMock.user.findUnique.mockResolvedValue(targetUser);
            prismaMock.user.update.mockResolvedValue(updatedUser as never);

            const res = await app.request(`/api/users/${targetUser.id}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ role: "AUTHOR" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.role).toBe(Role.AUTHOR);
        });

        it("should prevent admin from changing their own role", async () => {
            const adminSession = mockAdminSession();
            setupAdminAuth();

            const res = await app.request(`/api/users/${adminSession.user.id}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ role: "READER" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe("Cannot change your own role");
        });

        it("should return 404 when user not found", async () => {
            setupAdminAuth();
            prismaMock.user.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/users/nonexistent/role", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ role: "AUTHOR" }),
            });
            const body: any = await res.json();

            expect(res.status).toBe(404);
            expect(body.error).toBe("User not found");
        });

        it("should return 403 when user is not admin", async () => {
            setupReaderAuth();

            const res = await app.request("/api/users/some-id/role", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ role: "AUTHOR" }),
            });

            expect(res.status).toBe(403);
        });

        it("should return 400 for invalid role", async () => {
            setupAdminAuth();

            const res = await app.request("/api/users/some-id/role", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: "better-auth.session_token=test-token",
                },
                body: JSON.stringify({ role: "INVALID_ROLE" }),
            });

            expect(res.status).toBe(400);
        });
    });
});
