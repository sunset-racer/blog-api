import { vi } from "vitest";

/**
 * Mock auth object that mimics Better-Auth's structure
 * This file exists to provide a synchronous mock for @/lib/auth
 *
 * IMPORTANT: vi.fn() with default implementation
 */
export const mockAuth = {
    api: {
        getSession: vi.fn(() => Promise.resolve(null)),
    },
    handler: vi.fn(),
};

// Export as 'auth' to match the real module's export
export const auth = mockAuth;
