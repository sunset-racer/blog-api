import { vi } from "vitest";
import { Role } from "../../../generated/prisma/client.js";

// ============================================
// Types
// ============================================

export interface MockUser {
    id: string;
    email: string;
    name: string;
    role: Role;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MockSession {
    id: string;
    expiresAt: Date;
    token: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MockAuthSession {
    user: MockUser;
    session: MockSession;
}

// ============================================
// Mock Session Factories
// ============================================

/**
 * Create a mock session with configurable user and session data
 */
export const createMockSession = (
    userOverrides: Partial<MockUser> = {},
    sessionOverrides: Partial<MockSession> = {}
): MockAuthSession => {
    const userId = userOverrides.id || "cltest123456789012345678";

    return {
        user: {
            id: userId,
            email: "test@example.com",
            name: "Test User",
            role: Role.READER,
            emailVerified: true,
            image: null,
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
            updatedAt: new Date("2024-01-01T00:00:00.000Z"),
            ...userOverrides,
        },
        session: {
            id: "clsess123456789012345678",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            token: "test-session-token-abc123",
            userId,
            ipAddress: "127.0.0.1",
            userAgent: "vitest-test-agent",
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
            updatedAt: new Date("2024-01-01T00:00:00.000Z"),
            ...sessionOverrides,
        },
    };
};

/**
 * Create a mock session for a READER role user
 */
export const mockReaderSession = (
    overrides: Partial<MockUser> = {}
): MockAuthSession =>
    createMockSession({
        role: Role.READER,
        email: "reader@example.com",
        name: "Reader User",
        ...overrides,
    });

/**
 * Create a mock session for an AUTHOR role user
 */
export const mockAuthorSession = (
    overrides: Partial<MockUser> = {}
): MockAuthSession =>
    createMockSession({
        id: "clauthor12345678901234567",
        role: Role.AUTHOR,
        email: "author@example.com",
        name: "Author User",
        ...overrides,
    });

/**
 * Create a mock session for an ADMIN role user
 */
export const mockAdminSession = (
    overrides: Partial<MockUser> = {}
): MockAuthSession =>
    createMockSession({
        id: "cladmin123456789012345678",
        role: Role.ADMIN,
        email: "admin@example.com",
        name: "Admin User",
        ...overrides,
    });

// ============================================
// Auth Module Mock
// ============================================

/**
 * Mock auth object that mimics Better-Auth's structure
 */
export const mockAuth = {
    api: {
        getSession: vi.fn<(args: { headers: Headers }) => Promise<MockAuthSession | null>>(),
    },
    handler: vi.fn(),
};

/**
 * Setup the auth mock to return a specific session (or null for unauthenticated)
 */
export const setupAuthMock = (session: MockAuthSession | null): void => {
    mockAuth.api.getSession.mockResolvedValue(session);
};

/**
 * Setup auth mock for an authenticated reader
 */
export const setupReaderAuth = (overrides: Partial<MockUser> = {}): void => {
    setupAuthMock(mockReaderSession(overrides));
};

/**
 * Setup auth mock for an authenticated author
 */
export const setupAuthorAuth = (overrides: Partial<MockUser> = {}): void => {
    setupAuthMock(mockAuthorSession(overrides));
};

/**
 * Setup auth mock for an authenticated admin
 */
export const setupAdminAuth = (overrides: Partial<MockUser> = {}): void => {
    setupAuthMock(mockAdminSession(overrides));
};

/**
 * Setup auth mock for unauthenticated requests
 */
export const setupUnauthenticated = (): void => {
    setupAuthMock(null);
};

// ============================================
// Module Mock Registration
// ============================================

// Mock the auth module
vi.mock("@/lib/auth", () => ({
    auth: mockAuth,
}));
