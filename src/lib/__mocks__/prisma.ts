import { vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "../../../generated/prisma/client.ts";

// Create the mock instance with fallback to catch unmocked methods
export const prismaMock = mockDeep<PrismaClient>({
    fallbackMockImplementation: () => {
        throw new Error('Method not mocked - please add a mock implementation for this Prisma method');
    },
});

// Export as 'prisma' to match the real module's export
export const prisma = prismaMock;

// Mock the pool
export const pool = {
    end: vi.fn().mockResolvedValue(undefined),
};

// Mock disconnectDatabase
export const disconnectDatabase = vi.fn().mockResolvedValue(undefined);

// Export type
export type MockPrismaClient = DeepMockProxy<PrismaClient>;
