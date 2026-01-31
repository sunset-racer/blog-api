import { describe, it, expect } from "vitest";
import {
    idParamSchema,
    postIdParamSchema,
    commentIdParamSchema,
    requestIdParamSchema,
    userIdParamSchema,
    tagIdParamSchema,
    postSlugParamSchema,
    tagSlugParamSchema,
} from "../../../src/schemas/params.schema";

describe("params.schema", () => {
    // Valid CUID format: starts with 'c' followed by 24 alphanumeric characters
    const validCuid = "c1234567890abcdefghij1234";
    const invalidCuids = [
        "",
        "123",
        "abc",
        "1234567890abcdefghij12345", // missing 'c' prefix
        "c123456789", // too short
        "c1234567890abcdefghij12345678", // too long
        "c1234567890abcdefghij123!", // invalid character
    ];

    describe("idParamSchema", () => {
        it("should validate valid CUID", () => {
            const result = idParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid CUIDs", () => {
            for (const id of invalidCuids) {
                const result = idParamSchema.safeParse({ id });
                expect(result.success).toBe(false);
            }
        });

        it("should reject missing id", () => {
            const result = idParamSchema.safeParse({});
            expect(result.success).toBe(false);
        });

        it("should provide error message for invalid id", () => {
            const result = idParamSchema.safeParse({ id: "invalid" });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Invalid id");
            }
        });
    });

    describe("postIdParamSchema", () => {
        it("should validate valid CUID for postId", () => {
            const result = postIdParamSchema.safeParse({ postId: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid postId", () => {
            const result = postIdParamSchema.safeParse({ postId: "invalid" });
            expect(result.success).toBe(false);
        });

        it("should reject wrong key name", () => {
            const result = postIdParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(false);
        });
    });

    describe("commentIdParamSchema", () => {
        it("should validate valid CUID", () => {
            const result = commentIdParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid id", () => {
            const result = commentIdParamSchema.safeParse({ id: "invalid" });
            expect(result.success).toBe(false);
        });
    });

    describe("requestIdParamSchema", () => {
        it("should validate valid CUID for requestId", () => {
            const result = requestIdParamSchema.safeParse({ requestId: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid requestId", () => {
            const result = requestIdParamSchema.safeParse({ requestId: "invalid" });
            expect(result.success).toBe(false);
        });

        it("should reject wrong key name", () => {
            const result = requestIdParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(false);
        });
    });

    describe("userIdParamSchema", () => {
        it("should validate valid CUID", () => {
            const result = userIdParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid id", () => {
            const result = userIdParamSchema.safeParse({ id: "not-a-cuid" });
            expect(result.success).toBe(false);
        });
    });

    describe("tagIdParamSchema", () => {
        it("should validate valid CUID", () => {
            const result = tagIdParamSchema.safeParse({ id: validCuid });
            expect(result.success).toBe(true);
        });

        it("should reject invalid id", () => {
            const result = tagIdParamSchema.safeParse({ id: "bad-id" });
            expect(result.success).toBe(false);
        });
    });

    describe("postSlugParamSchema", () => {
        it("should validate simple slug", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my-post" });
            expect(result.success).toBe(true);
        });

        it("should validate slug with numbers", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my-post-2024" });
            expect(result.success).toBe(true);
        });

        it("should validate single word slug", () => {
            const result = postSlugParamSchema.safeParse({ slug: "javascript" });
            expect(result.success).toBe(true);
        });

        it("should validate slug with multiple hyphens", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my-awesome-blog-post" });
            expect(result.success).toBe(true);
        });

        it("should reject empty slug", () => {
            const result = postSlugParamSchema.safeParse({ slug: "" });
            expect(result.success).toBe(false);
        });

        it("should reject slug with uppercase letters", () => {
            const result = postSlugParamSchema.safeParse({ slug: "My-Post" });
            expect(result.success).toBe(false);
        });

        it("should reject slug starting with hyphen", () => {
            const result = postSlugParamSchema.safeParse({ slug: "-my-post" });
            expect(result.success).toBe(false);
        });

        it("should reject slug ending with hyphen", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my-post-" });
            expect(result.success).toBe(false);
        });

        it("should reject slug with consecutive hyphens", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my--post" });
            expect(result.success).toBe(false);
        });

        it("should reject slug with spaces", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my post" });
            expect(result.success).toBe(false);
        });

        it("should reject slug with special characters", () => {
            const result = postSlugParamSchema.safeParse({ slug: "my_post!" });
            expect(result.success).toBe(false);
        });

        it("should reject slug exceeding 200 characters", () => {
            const result = postSlugParamSchema.safeParse({ slug: "a".repeat(201) });
            expect(result.success).toBe(false);
        });

        it("should accept slug at max length of 200", () => {
            const result = postSlugParamSchema.safeParse({ slug: "a".repeat(200) });
            expect(result.success).toBe(true);
        });

        it("should provide error message for invalid slug", () => {
            const result = postSlugParamSchema.safeParse({ slug: "Invalid-Slug" });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe("Invalid slug");
            }
        });
    });

    describe("tagSlugParamSchema", () => {
        it("should validate simple tag slug", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "javascript" });
            expect(result.success).toBe(true);
        });

        it("should validate tag slug with hyphen", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "web-dev" });
            expect(result.success).toBe(true);
        });

        it("should validate tag slug with numbers", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "es2024" });
            expect(result.success).toBe(true);
        });

        it("should reject empty tag slug", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "" });
            expect(result.success).toBe(false);
        });

        it("should reject invalid tag slug format", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "Web-Dev" });
            expect(result.success).toBe(false);
        });

        it("should reject tag slug with special characters", () => {
            const result = tagSlugParamSchema.safeParse({ slug: "c++" });
            expect(result.success).toBe(false);
        });
    });
});
