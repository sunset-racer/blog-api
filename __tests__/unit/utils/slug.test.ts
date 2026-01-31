import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { slugify, generateUniqueSlug, generateUniqueTagSlug } from "../../../src/utils/slug";

// Create the mock for dependency injection
const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// Reset mock state before each test
beforeEach(() => {
    mockReset(prismaMock);
});

describe("slug utilities", () => {

    describe("slugify", () => {
        it("should convert text to lowercase", () => {
            expect(slugify("Hello World")).toBe("hello-world");
        });

        it("should replace spaces with hyphens", () => {
            expect(slugify("hello world test")).toBe("hello-world-test");
        });

        it("should remove non-word characters", () => {
            expect(slugify("hello! @world# $test")).toBe("hello-world-test");
        });

        it("should replace multiple hyphens with single hyphen", () => {
            expect(slugify("hello---world")).toBe("hello-world");
        });

        it("should trim hyphens from start", () => {
            expect(slugify("-hello-world")).toBe("hello-world");
        });

        it("should trim hyphens from end", () => {
            expect(slugify("hello-world-")).toBe("hello-world");
        });

        it("should trim whitespace", () => {
            expect(slugify("  hello world  ")).toBe("hello-world");
        });

        it("should handle special characters", () => {
            expect(slugify("Hello & World!")).toBe("hello-world");
        });

        it("should handle numbers", () => {
            expect(slugify("My Post 2024")).toBe("my-post-2024");
        });

        it("should handle underscores", () => {
            expect(slugify("hello_world")).toBe("hello_world");
        });

        it("should return empty string for empty input", () => {
            expect(slugify("")).toBe("");
        });

        it("should handle string with only special characters", () => {
            expect(slugify("!@#$%^&*()")).toBe("");
        });

        it("should handle unicode characters", () => {
            expect(slugify("Café München")).toBe("caf-mnchen");
        });

        it("should handle multiple spaces", () => {
            expect(slugify("hello    world")).toBe("hello-world");
        });
    });

    describe("generateUniqueSlug", () => {
        it("should return base slug when no existing post found", async () => {
            prismaMock.post.findUnique.mockResolvedValue(null);

            const result = await generateUniqueSlug("My New Post", undefined, prismaMock);

            expect(result).toBe("my-new-post");
            expect(prismaMock.post.findUnique).toHaveBeenCalledWith({
                where: { slug: "my-new-post" },
                select: { id: true },
            });
        });

        it("should append number when slug exists", async () => {
            prismaMock.post.findUnique
                .mockResolvedValueOnce({ id: "existing-id" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueSlug("My Post", undefined, prismaMock);

            expect(result).toBe("my-post-1");
            expect(prismaMock.post.findUnique).toHaveBeenCalledTimes(2);
        });

        it("should increment counter until unique slug found", async () => {
            prismaMock.post.findUnique
                .mockResolvedValueOnce({ id: "id-1" } as never)
                .mockResolvedValueOnce({ id: "id-2" } as never)
                .mockResolvedValueOnce({ id: "id-3" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueSlug("Popular Title", undefined, prismaMock);

            expect(result).toBe("popular-title-3");
            expect(prismaMock.post.findUnique).toHaveBeenCalledTimes(4);
        });

        it("should return base slug when excludeId matches existing post", async () => {
            const postId = "my-post-id";
            prismaMock.post.findUnique.mockResolvedValue({ id: postId } as never);

            const result = await generateUniqueSlug("My Post", postId, prismaMock);

            expect(result).toBe("my-post");
        });

        it("should continue searching when excludeId does not match", async () => {
            prismaMock.post.findUnique
                .mockResolvedValueOnce({ id: "different-id" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueSlug("My Post", "my-id", prismaMock);

            expect(result).toBe("my-post-1");
        });

        it("should handle empty title", async () => {
            prismaMock.post.findUnique.mockResolvedValue(null);

            const result = await generateUniqueSlug("", undefined, prismaMock);

            expect(result).toBe("");
        });
    });

    describe("generateUniqueTagSlug", () => {
        it("should return base slug when no existing tag found", async () => {
            prismaMock.tag.findUnique.mockResolvedValue(null);

            const result = await generateUniqueTagSlug("JavaScript", undefined, prismaMock);

            expect(result).toBe("javascript");
            expect(prismaMock.tag.findUnique).toHaveBeenCalledWith({
                where: { slug: "javascript" },
                select: { id: true },
            });
        });

        it("should append number when tag slug exists", async () => {
            prismaMock.tag.findUnique
                .mockResolvedValueOnce({ id: "existing-tag-id" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueTagSlug("React", undefined, prismaMock);

            expect(result).toBe("react-1");
            expect(prismaMock.tag.findUnique).toHaveBeenCalledTimes(2);
        });

        it("should increment counter until unique tag slug found", async () => {
            prismaMock.tag.findUnique
                .mockResolvedValueOnce({ id: "id-1" } as never)
                .mockResolvedValueOnce({ id: "id-2" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueTagSlug("Web Dev", undefined, prismaMock);

            expect(result).toBe("web-dev-2");
            expect(prismaMock.tag.findUnique).toHaveBeenCalledTimes(3);
        });

        it("should return base slug when excludeId matches existing tag", async () => {
            const tagId = "my-tag-id";
            prismaMock.tag.findUnique.mockResolvedValue({ id: tagId } as never);

            const result = await generateUniqueTagSlug("TypeScript", tagId, prismaMock);

            expect(result).toBe("typescript");
        });

        it("should continue searching when excludeId does not match", async () => {
            prismaMock.tag.findUnique
                .mockResolvedValueOnce({ id: "different-id" } as never)
                .mockResolvedValueOnce(null);

            const result = await generateUniqueTagSlug("Node.js", "my-tag-id", prismaMock);

            expect(result).toBe("nodejs-1");
        });

        it("should handle multi-word tag names", async () => {
            prismaMock.tag.findUnique.mockResolvedValue(null);

            const result = await generateUniqueTagSlug("Machine Learning", undefined, prismaMock);

            expect(result).toBe("machine-learning");
        });
    });
});
