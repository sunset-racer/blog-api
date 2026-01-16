import { Hono } from "hono";
import { requireAuth, type AuthContext } from "@/middleware/auth";
import { createClient } from "@supabase/supabase-js";

const upload = new Hono<AuthContext>();

// Validate Supabase environment variables at startup
if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL environment variable is required");
}
if (!process.env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY environment variable is required");
}

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Allowed image types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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

        // Generate unique filename
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `blog-images/${fileName}`;

        // Convert File to ArrayBuffer then to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Upload to Supabase Storage
        const { error } = await supabase.storage.from("uploads").upload(filePath, uint8Array, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
        });

        if (error) {
            console.error("Supabase upload error:", error);
            return c.json({ error: "Failed to upload image", details: error.message }, 500);
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(filePath);

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
        const { path } = await c.req.json();

        if (!path) {
            return c.json({ error: "No file path provided" }, 400);
        }

        // Check if user owns this image (path should start with their user ID)
        const isOwner = path.startsWith(`blog-images/${user.id}/`);
        const isAdmin = user.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return c.json({ error: "Forbidden" }, 403);
        }

        // Delete from Supabase Storage
        const { error } = await supabase.storage.from("uploads").remove([path]);

        if (error) {
            console.error("Supabase delete error:", error);
            return c.json({ error: "Failed to delete image", details: error.message }, 500);
        }

        return c.json({ message: "Image deleted successfully" });
    } catch (error) {
        console.error("Delete error:", error);
        return c.json({ error: "Failed to delete image" }, 500);
    }
});

export default upload;
