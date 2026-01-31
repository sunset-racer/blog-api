import { vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type {
    PrismaClient,
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

// Create the mock - NOT using vi.hoisted, just a regular variable
// The vi.mock factory will use dynamic import to get this
const _prismaMock = mockDeep<PrismaClient>();

// Mock the prisma module using async factory with dynamic import
vi.mock("@/lib/prisma", async () => {
    // Dynamic import to get the mock from this file after it's initialized
    const { getPrismaMock } = await import("./prisma");
    return {
        prisma: getPrismaMock(),
        pool: {
            end: vi.fn().mockResolvedValue(undefined),
        },
        disconnectDatabase: vi.fn().mockResolvedValue(undefined),
    };
});

// Export a getter function (not the hoisted variable directly)
export const getPrismaMock = () => _prismaMock;

// Export the mock for direct use in tests (this works because it's not vi.hoisted)
export const prismaMock = _prismaMock;

// Reset mocks before each test
beforeEach(() => {
    mockReset(_prismaMock);
});

// Export type for use in tests
export type MockPrismaClient = DeepMockProxy<PrismaClient>;

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
    content: "This is test content for the post.",
    excerpt: "Test excerpt",
    coverImage: null,
    status: PostStatus.DRAFT,
    viewCount: 0,
    isFeatured: false,
    publishedAt: null,
    authorId: "cltest123456789012345678",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
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
    id: "clcomm123456789012345678",
    content: "This is a test comment.",
    postId: "clpost123456789012345678",
    authorId: "cltest123456789012345678",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

/**
 * Create a mock PublishRequest object
 */
export const mockPublishRequest = (
    overrides: Partial<PublishRequest> = {}
): PublishRequest => ({
    id: "clpubreq12345678901234567",
    postId: "clpost123456789012345678",
    authorId: "cltest123456789012345678",
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
    id: "clprof123456789012345678",
    userId: "cltest123456789012345678",
    name: "Test User",
    bio: "Test bio",
    avatar: null,
    website: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create a mock user with a specific role
 */
export const mockUserWithRole = (role: Role, overrides: Partial<User> = {}) =>
    mockUser({ role, ...overrides });

/**
 * Create a mock admin user
 */
export const mockAdminUser = (overrides: Partial<User> = {}) =>
    mockUser({ role: Role.ADMIN, email: "admin@example.com", ...overrides });

/**
 * Create a mock author user
 */
export const mockAuthorUser = (overrides: Partial<User> = {}) =>
    mockUser({ role: Role.AUTHOR, email: "author@example.com", ...overrides });

/**
 * Create a mock post with a specific status
 */
export const mockPostWithStatus = (
    status: PostStatus,
    overrides: Partial<Post> = {}
) =>
    mockPost({
        status,
        publishedAt:
            status === PostStatus.PUBLISHED ? new Date() : null,
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
