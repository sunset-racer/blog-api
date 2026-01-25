import { describe, it, expect, beforeEach } from "vitest";
import {
    prismaMock,
    mockUser,
    mockPost,
    mockTag,
} from "./setup/mocks/prisma";
import {
    mockReaderSession,
    mockAuthorSession,
    mockAdminSession,
    setupAuthMock,
    mockAuth,
} from "./setup/mocks/auth";
import {
    mockSupabaseStorage,
    simulateUploadSuccess,
    simulateUploadError,
    resetSupabaseMocks,
    getMockBucket,
} from "./setup/mocks/supabase";

describe("Test Setup Verification", () => {
    describe("Prisma Mock", () => {
        it("should create mock user with defaults", () => {
            const user = mockUser();

            expect(user.id).toBe("cltest123456789012345678");
            expect(user.email).toBe("test@example.com");
            expect(user.role).toBe("READER");
        });

        it("should allow overriding user properties", () => {
            const user = mockUser({
                email: "custom@example.com",
                role: "ADMIN",
            });

            expect(user.email).toBe("custom@example.com");
            expect(user.role).toBe("ADMIN");
        });

        it("should create mock post with defaults", () => {
            const post = mockPost();

            expect(post.title).toBe("Test Post");
            expect(post.slug).toBe("test-post");
            expect(post.status).toBe("DRAFT");
        });

        it("should create mock tag with defaults", () => {
            const tag = mockTag();

            expect(tag.name).toBe("Test Tag");
            expect(tag.slug).toBe("test-tag");
        });

        it("should have prisma mock available", () => {
            expect(prismaMock).toBeDefined();
            expect(prismaMock.user).toBeDefined();
            expect(prismaMock.post).toBeDefined();
        });

        it("should allow mocking prisma methods", async () => {
            const user = mockUser({ email: "mocked@example.com" });
            prismaMock.user.findUnique.mockResolvedValue(user);

            const result = await prismaMock.user.findUnique({
                where: { id: "test" },
            });

            expect(result).toEqual(user);
            expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
                where: { id: "test" },
            });
        });
    });

    describe("Auth Mock", () => {
        it("should create reader session", () => {
            const session = mockReaderSession();

            expect(session.user.role).toBe("READER");
            expect(session.user.email).toBe("reader@example.com");
            expect(session.session.token).toBeDefined();
        });

        it("should create author session", () => {
            const session = mockAuthorSession();

            expect(session.user.role).toBe("AUTHOR");
            expect(session.user.email).toBe("author@example.com");
        });

        it("should create admin session", () => {
            const session = mockAdminSession();

            expect(session.user.role).toBe("ADMIN");
            expect(session.user.email).toBe("admin@example.com");
        });

        it("should setup auth mock for authenticated requests", async () => {
            const session = mockAdminSession();
            setupAuthMock(session);

            const result = await mockAuth.api.getSession({
                headers: new Headers(),
            });

            expect(result).toEqual(session);
        });

        it("should setup auth mock for unauthenticated requests", async () => {
            setupAuthMock(null);

            const result = await mockAuth.api.getSession({
                headers: new Headers(),
            });

            expect(result).toBeNull();
        });
    });

    describe("Supabase Mock", () => {
        beforeEach(() => {
            resetSupabaseMocks();
        });

        it("should have storage mock available", () => {
            expect(mockSupabaseStorage).toBeDefined();
            expect(mockSupabaseStorage.from).toBeDefined();
        });

        it("should simulate successful upload", async () => {
            simulateUploadSuccess("user-123/image.jpg");
            const bucket = getMockBucket();

            const result = await bucket.upload("path", new Blob(["test"]));

            expect(result.error).toBeNull();
            expect(result.data?.path).toBe("user-123/image.jpg");
        });

        it("should simulate upload error", async () => {
            simulateUploadError("File too large");
            const bucket = getMockBucket();

            const result = await bucket.upload("path", new Blob(["test"]));

            expect(result.error?.message).toBe("File too large");
            expect(result.data).toBeNull();
        });

        it("should return public URL", () => {
            const bucket = getMockBucket();
            const result = bucket.getPublicUrl("test/path");

            expect(result.data.publicUrl).toContain("supabase.co");
        });
    });

    describe("Environment Variables", () => {
        it("should have test environment set", () => {
            expect(process.env.NODE_ENV).toBe("test");
        });

        it("should have database URL set", () => {
            expect(process.env.DATABASE_URL).toBeDefined();
        });

        it("should have auth secrets set", () => {
            expect(process.env.BETTER_AUTH_SECRET).toBeDefined();
            expect(process.env.BETTER_AUTH_URL).toBeDefined();
        });

        it("should have Supabase config set", () => {
            expect(process.env.SUPABASE_URL).toBeDefined();
            expect(process.env.SUPABASE_ANON_KEY).toBeDefined();
        });
    });
});
