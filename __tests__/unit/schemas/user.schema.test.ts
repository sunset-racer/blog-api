import { describe, it, expect } from "vitest";
import { getUsersQuerySchema } from "../../../src/schemas/user.schema";

describe("user.schema", () => {
    describe("getUsersQuerySchema", () => {
        it("should provide defaults for empty query", () => {
            const result = getUsersQuerySchema.safeParse({});

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(1);
                expect(result.data.limit).toBe(20);
            }
        });

        it("should validate with search parameter", () => {
            const result = getUsersQuerySchema.safeParse({
                search: "john",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.search).toBe("john");
            }
        });

        it("should validate ADMIN role", () => {
            const result = getUsersQuerySchema.safeParse({ role: "ADMIN" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.role).toBe("ADMIN");
            }
        });

        it("should validate AUTHOR role", () => {
            const result = getUsersQuerySchema.safeParse({ role: "AUTHOR" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.role).toBe("AUTHOR");
            }
        });

        it("should validate READER role", () => {
            const result = getUsersQuerySchema.safeParse({ role: "READER" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.role).toBe("READER");
            }
        });

        it("should reject invalid role", () => {
            const result = getUsersQuerySchema.safeParse({ role: "MODERATOR" });
            expect(result.success).toBe(false);
        });

        it("should coerce string page to number", () => {
            const result = getUsersQuerySchema.safeParse({ page: "3" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.page).toBe(3);
            }
        });

        it("should coerce string limit to number", () => {
            const result = getUsersQuerySchema.safeParse({ limit: "50" });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.limit).toBe(50);
            }
        });

        it("should reject negative page", () => {
            const result = getUsersQuerySchema.safeParse({ page: -1 });
            expect(result.success).toBe(false);
        });

        it("should reject zero page", () => {
            const result = getUsersQuerySchema.safeParse({ page: 0 });
            expect(result.success).toBe(false);
        });

        it("should reject negative limit", () => {
            const result = getUsersQuerySchema.safeParse({ limit: -1 });
            expect(result.success).toBe(false);
        });

        it("should reject limit exceeding 100", () => {
            const result = getUsersQuerySchema.safeParse({ limit: 101 });
            expect(result.success).toBe(false);
        });

        it("should accept limit at max value of 100", () => {
            const result = getUsersQuerySchema.safeParse({ limit: 100 });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.limit).toBe(100);
            }
        });

        it("should validate with all parameters", () => {
            const result = getUsersQuerySchema.safeParse({
                search: "test user",
                role: "AUTHOR",
                page: 2,
                limit: 25,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.search).toBe("test user");
                expect(result.data.role).toBe("AUTHOR");
                expect(result.data.page).toBe(2);
                expect(result.data.limit).toBe(25);
            }
        });

        it("should reject non-integer page", () => {
            const result = getUsersQuerySchema.safeParse({ page: 1.5 });
            expect(result.success).toBe(false);
        });

        it("should reject non-integer limit", () => {
            const result = getUsersQuerySchema.safeParse({ limit: 10.5 });
            expect(result.success).toBe(false);
        });
    });
});
