import { Hono } from "hono";
import path from "path";
import { requireAuth, type AuthContext } from "@/middleware/auth";
import { createClient } from "@supabase/supabase-js";
import { sanitizeFileName } from "@/utils/sanitize";
import { validateBody } from "@/utils/validation";
import { deleteUploadSchema } from "@/schemas/upload.schema";

const upload = new Hono<AuthContext>();
const isProduction = process.env.NODE_ENV === "production";

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
    if (!process.env.SUPABASE_URL) {
        throw new Error("SUPABASE_URL environment variable is required");
    }
    if (!process.env.SUPABASE_ANON_KEY) {
        throw new Error("SUPABASE_ANON_KEY environment variable is required");
    }

    if (!supabase) {
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }

    return supabase;
}

// Allowed image types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const EXTENSION_BY_MIME: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

const SAFE_PATH_REGEX = /^[a-zA-Z0-9/_\-.]+$/;

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
    return signature.every((byte, index) => bytes[index] === byte);
}

function matchesSignature(mimeType: string, bytes: Uint8Array): boolean {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (mimeType === "image/png") {
        return bytes.length >= 8 && hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
    if (mimeType === "image/gif") {
        return (
            bytes.length >= 6 &&
            bytes[0] === 0x47 &&
            bytes[1] === 0x49 &&
            bytes[2] === 0x46 &&
            bytes[3] === 0x38 &&
            (bytes[4] === 0x37 || bytes[4] === 0x39) &&
            bytes[5] === 0x61
        );
    }
    if (mimeType === "image/webp") {
        return (
            bytes.length >= 12 &&
            hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
        );
    }
    return false;
}

function isSafeUploadPath(pathValue: string): boolean {
    if (!SAFE_PATH_REGEX.test(pathValue)) return false;
    if (pathValue.includes("..") || pathValue.includes("\\")) return false;
    const normalized = path.posix.normalize(pathValue);
    if (normalized !== pathValue) return false;
    if (!normalized.startsWith("blog-images/")) return false;
    const segments = normalized.split("/").filter(Boolean);
    return segments.length >= 3;
}

// ============================================
// UPLOAD IMAGE
// ============================================
upload.post("/image", requireAuth, async (c) => {
    try {
        const user = c.get("user");
        const formData = await c.req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return c.json({ error: "No file provided" }, 400);
        }

        // Validate file type
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return c.json(
                {
                    error: "Invalid file type",
                    allowed: ALLOWED_IMAGE_TYPES,
                },
                400,
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return c.json(
                {
                    error: "File too large",
                    maxSize: "5MB",
                    receivedSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
                },
                400,
            );
        }

        const fileExt = EXTENSION_BY_MIME[file.type];
        if (!fileExt) {
            return c.json({ error: "Invalid file extension" }, 400);
        }

        // Generate unique filename
        const rawBaseName = file.name.replace(/\.[^/.]+$/, "");
        const safeBaseName = sanitizeFileName(rawBaseName).slice(0, 50) || "upload";
        const fileName = `${user.id}/${Date.now()}-${safeBaseName}-${Math.random()
            .toString(36)
            .substring(7)}.${fileExt}`;
        const filePath = `blog-images/${fileName}`;

        // Convert File to ArrayBuffer then to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        if (!matchesSignature(file.type, uint8Array)) {
            return c.json({ error: "Invalid file content" }, 400);
        }

        // Upload to Supabase Storage
        const supabaseClient = getSupabaseClient();
        const { error } = await supabaseClient.storage.from("uploads").upload(filePath, uint8Array, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
        });

        if (error) {
            console.error("Supabase upload error:", error);
            return c.json(
                {
                    error: "Failed to upload image",
                    details: isProduction ? undefined : error.message,
                },
                500
            );
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage.from("uploads").getPublicUrl(filePath);

        return c.json({
            url: urlData.publicUrl,
            path: filePath,
            size: file.size,
            type: file.type,
        });
    } catch (error) {
        console.error("Upload error:", error);
        return c.json({ error: "Failed to upload image" }, 500);
    }
});

// ============================================
// DELETE IMAGE
// ============================================
upload.delete("/image", requireAuth, async (c) => {
    try {
        const user = c.get("user");
        const data = await validateBody(c, deleteUploadSchema);
        if (!data) return;
        const { path: filePath } = data;

        if (!isSafeUploadPath(filePath)) {
            return c.json({ error: "Invalid file path" }, 400);
        }

        // Check if user owns this image (path should start with their user ID)
        const isOwner = filePath.startsWith(`blog-images/${user.id}/`);
        const isAdmin = user.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return c.json({ error: "Forbidden" }, 403);
        }

        // Delete from Supabase Storage
        const supabaseClient = getSupabaseClient();
        const { error } = await supabaseClient.storage.from("uploads").remove([filePath]);

        if (error) {
            console.error("Supabase delete error:", error);
            return c.json(
                {
                    error: "Failed to delete image",
                    details: isProduction ? undefined : error.message,
                },
                500
            );
        }

        return c.json({ message: "Image deleted successfully" });
    } catch (error) {
        console.error("Delete error:", error);
        return c.json({ error: "Failed to delete image" }, 500);
    }
});

export default upload;
