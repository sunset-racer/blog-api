import { vi, beforeEach, afterEach } from "vitest";

// ============================================
// Import and Register All Mocks
// ============================================

// These imports register the vi.mock() calls
import "./mocks/prisma";
import "./mocks/auth";
import "./mocks/supabase";

// Re-export mock utilities for convenience
export * from "./mocks/prisma";
export * from "./mocks/auth";
export * from "./mocks/supabase";

// ============================================
// Environment Variables
// ============================================

// Set test environment variables
Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    DIRECT_URL: "postgresql://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long!!",
    BETTER_AUTH_URL: "http://localhost:3001",
    FRONTEND_URL: "http://localhost:3000",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key-for-testing-purposes",
    PORT: "3001",
});

// ============================================
// Global Test Hooks
// ============================================

beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
});

afterEach(() => {
    // Restore real timers if fake timers were used
    vi.useRealTimers();
});

// ============================================
// Test Request Helpers
// ============================================

/**
 * Create a test request for Hono's app.request() method
 */
export const createTestRequest = (
    method: string,
    path: string,
    options: {
        body?: unknown;
        headers?: Record<string, string>;
        query?: Record<string, string>;
    } = {}
): Request => {
    const url = new URL(path, "http://localhost:3001");

    if (options.query) {
        Object.entries(options.query).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
    }

    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    return new Request(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
};

/**
 * Create a GET request
 */
export const get = (
    path: string,
    options: { headers?: Record<string, string>; query?: Record<string, string> } = {}
) => createTestRequest("GET", path, options);

/**
 * Create a POST request
 */
export const post = (
    path: string,
    body?: unknown,
    options: { headers?: Record<string, string> } = {}
) => createTestRequest("POST", path, { body, ...options });

/**
 * Create a PUT request
 */
export const put = (
    path: string,
    body?: unknown,
    options: { headers?: Record<string, string> } = {}
) => createTestRequest("PUT", path, { body, ...options });

/**
 * Create a PATCH request
 */
export const patch = (
    path: string,
    body?: unknown,
    options: { headers?: Record<string, string> } = {}
) => createTestRequest("PATCH", path, { body, ...options });

/**
 * Create a DELETE request
 */
export const del = (
    path: string,
    options: { headers?: Record<string, string>; body?: unknown } = {}
) => createTestRequest("DELETE", path, options);

// ============================================
// Response Helpers
// ============================================

/**
 * Parse JSON response body
 */
export const parseJson = async <T>(response: Response): Promise<T> => {
    return response.json() as Promise<T>;
};

/**
 * Assert response status and parse body
 */
export const expectStatus = async <T>(
    response: Response,
    expectedStatus: number
): Promise<T> => {
    if (response.status !== expectedStatus) {
        const body = await response.text();
        throw new Error(
            `Expected status ${expectedStatus}, got ${response.status}. Body: ${body}`
        );
    }
    return parseJson<T>(response);
};

/**
 * Assert successful response (200-299) and parse body
 */
export const expectSuccess = async <T>(response: Response): Promise<T> => {
    if (response.status < 200 || response.status >= 300) {
        const body = await response.text();
        throw new Error(
            `Expected success status, got ${response.status}. Body: ${body}`
        );
    }
    return parseJson<T>(response);
};

/**
 * Assert error response and parse body
 */
export const expectError = async (
    response: Response,
    expectedStatus: number
): Promise<{ error: string; details?: unknown }> => {
    if (response.status !== expectedStatus) {
        const body = await response.text();
        throw new Error(
            `Expected status ${expectedStatus}, got ${response.status}. Body: ${body}`
        );
    }
    return parseJson(response);
};

// ============================================
// Auth Header Helpers
// ============================================

/**
 * Create headers with a mock session cookie
 */
export const withAuth = (
    headers: Record<string, string> = {}
): Record<string, string> => ({
    ...headers,
    Cookie: "better-auth.session_token=test-session-token",
});

/**
 * Create headers without auth (for unauthenticated requests)
 */
export const withoutAuth = (
    headers: Record<string, string> = {}
): Record<string, string> => headers;

// ============================================
// Date Helpers
// ============================================

/**
 * Create a fixed date for consistent testing
 */
export const fixedDate = new Date("2024-01-15T12:00:00.000Z");

/**
 * Create a date relative to the fixed date
 */
export const daysAgo = (days: number): Date =>
    new Date(fixedDate.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * Create a date in the future relative to fixed date
 */
export const daysFromNow = (days: number): Date =>
    new Date(fixedDate.getTime() + days * 24 * 60 * 60 * 1000);

// ============================================
// ID Generators
// ============================================

let idCounter = 0;

/**
 * Generate a unique test ID (CUID-like format)
 */
export const generateTestId = (prefix: string = "cltest"): string => {
    idCounter++;
    return `${prefix}${String(idCounter).padStart(24, "0")}`;
};

/**
 * Reset the ID counter (call in beforeEach if needed)
 */
export const resetIdCounter = (): void => {
    idCounter = 0;
};
