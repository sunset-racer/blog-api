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

// Import the mock module FIRST (synchronously, before vi.mock registration)
// This ensures the mock instance exists when the factory runs
import * as authMockModule from "../../../src/lib/__mocks__/auth";

// Re-export the mockAuth for test files
export const mockAuth = authMockModule.mockAuth;

// Register mock with SYNCHRONOUS factory (returns already-imported module)
vi.mock("@/lib/auth", () => authMockModule);

// Note: mockReset: true in vitest.config.ts will reset the mock to its initial implementation
// (returning null) before each test. This allows setupAdminAuth(), setupReaderAuth(), etc.
// to override it in the test's beforeEach hook.

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
