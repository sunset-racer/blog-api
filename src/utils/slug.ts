import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Converts a string to a URL-friendly slug
 */
export function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-") // Replace spaces with -
        .replace(/[^\w\-]+/g, "") // Remove all non-word chars
        .replace(/\-\-+/g, "-") // Replace multiple - with single -
        .replace(/^-+/, "") // Trim - from start of text
        .replace(/-+$/, ""); // Trim - from end of text
}

// Type for the minimal Prisma client interface needed by these functions
type SlugPrismaClient = Pick<PrismaClient, "post" | "tag">;

/**
 * Generates a unique slug for a post
 * If slug exists, appends a number (e.g., my-post-1, my-post-2)
 * @param title - The title to generate a slug from
 * @param excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @param prisma - Optional Prisma client (for testing)
 */
export async function generateUniqueSlug(
    title: string,
    excludeId?: string,
    prisma: SlugPrismaClient = defaultPrisma
): Promise<string> {
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const existing = await prisma.post.findUnique({
            where: { slug },
            select: { id: true },
        });

        // If no existing post or it's the same post being updated
        if (!existing || existing.id === excludeId) {
            return slug;
        }

        // Try next variation
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
}

/**
 * Generates a unique slug for a tag
 * @param name - The tag name to generate a slug from
 * @param excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @param prisma - Optional Prisma client (for testing)
 */
export async function generateUniqueTagSlug(
    name: string,
    excludeId?: string,
    prisma: SlugPrismaClient = defaultPrisma
): Promise<string> {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const existing = await prisma.tag.findUnique({
            where: { slug },
            select: { id: true },
        });

        if (!existing || existing.id === excludeId) {
            return slug;
        }

        slug = `${baseSlug}-${counter}`;
        counter++;
    }
}
