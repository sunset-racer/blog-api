import { vi } from "vitest";
import { type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
    User,
    Post,
    Tag,
    Comment,
    PublishRequest,
    Profile,
} from "../../../generated/prisma/client.js";
import {
    Role,
    PostStatus,
    PublishRequestStatus,
} from "../../../generated/prisma/client.js";

// Register the mock - use async factory to dynamically import the mock module
// This is the original working pattern before the "fix" was attempted
vi.mock("@/lib/prisma", async () => {
    const { prismaMock, pool, disconnectDatabase } = await import("../../../src/lib/__mocks__/prisma.js");
    return {
        prisma: prismaMock,
        prismaMock,
        pool,
        disconnectDatabase,
    };
});

// Now import and re-export the mock for use in tests
const mockModule = await import("../../../src/lib/__mocks__/prisma.js");
const prismaMock = mockModule.prismaMock;

// Export the mock for use in tests
export { prismaMock };
export type MockPrismaClient = DeepMockProxy<PrismaClient>;

// Note: Each test should set up its mock expectations using .mockResolvedValue() etc.
// No global clearing is needed since mockDeep creates fresh mock proxies for each method call

// Re-export enums for convenience
export { Role, PostStatus, PublishRequestStatus };

// ============================================
// Mock Data Factories
// ============================================

/**
 * Create a mock User object
 */
export const mockUser = (overrides: Partial<User> = {}): User => ({
    id: "cltest123456789012345678",
    email: "test@example.com",
    name: "Test User",
    role: Role.READER,
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock Post object
 */
export const mockPost = (overrides: Partial<Post> = {}): Post => ({
    id: "clpost123456789012345678",
    title: "Test Post",
    slug: "test-post",
    content: "Test content for the post",
    excerpt: "Test excerpt",
    status: PostStatus.DRAFT,
    isFeatured: false,
    viewCount: 0,
    publishedAt: null,
    authorId: "clauthor12345678901234567",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    coverImage: null,
    ...overrides,
});

/**
 * Create a mock Tag object
 */
export const mockTag = (overrides: Partial<Tag> = {}): Tag => ({
    id: "cltag1234567890123456789",
    name: "Test Tag",
    slug: "test-tag",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock Comment object
 */
export const mockComment = (overrides: Partial<Comment> = {}): Comment => ({
    id: "clcomment123456789012345",
    content: "Test comment content",
    postId: "clpost123456789012345678",
    authorId: "clauthor12345678901234567",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock PublishRequest object
 */
export const mockPublishRequest = (overrides: Partial<PublishRequest> = {}): PublishRequest => ({
    id: "clpub123456789012345678",
    postId: "clpost123456789012345678",
    authorId: "clauthor12345678901234567",
    status: PublishRequestStatus.PENDING,
    message: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock Profile object
 */
export const mockProfile = (overrides: Partial<Profile> = {}): Profile => ({
    id: "clprofile12345678901234567",
    userId: "cluser123456789012345678",
    name: "Test User",
    bio: "Test bio",
    avatar: null,
    website: "https://example.com",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock draft post
 */
export const mockDraftPost = (overrides: Partial<Post> = {}) =>
    mockPost({
        status: PostStatus.DRAFT,
        publishedAt: null,
        ...overrides,
    });

/**
 * Create a mock published post
 */
export const mockPublishedPost = (overrides: Partial<Post> = {}) =>
    mockPost({
        status: PostStatus.PUBLISHED,
        publishedAt: new Date("2024-01-15T00:00:00.000Z"),
        ...overrides,
    });
