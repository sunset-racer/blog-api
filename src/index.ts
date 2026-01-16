import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { auth } from "@/lib/auth";
import { disconnectDatabase } from "@/lib/prisma";
import {
    securityHeaders,
    requestValidation,
    jsonBodyLimit,
    uploadBodyLimit,
} from "@/middleware/security";
import { generalRateLimit, authRateLimit, uploadRateLimit } from "@/middleware/rate-limit";
import healthRoute from "@/routes/health";
import meRoute from "@/routes/me";
import postsRoute from "@/routes/posts";
import publishRoute from "@/routes/publish";
import tagsRoute from "@/routes/tags";
import uploadRoute from "@/routes/upload";
import commentsRoute from "@/routes/comments";
import usersRoute from "@/routes/users";

const app = new Hono();

// CORS - MUST be first to handle preflight (OPTIONS) requests
const isProduction = process.env.NODE_ENV === "production";

// Build allowed origins based on environment
const allowedOrigins: string[] = [];
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}
if (!isProduction) {
    // Development: include localhost URLs
    allowedOrigins.push("http://localhost:3000", "http://localhost:3001");
}

app.use(
    "*",
    cors({
        origin: (origin) => {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return process.env.FRONTEND_URL || "http://localhost:3000";
            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) return origin;
            // In development, be more permissive
            if (!isProduction && origin.startsWith("http://localhost:")) return origin;
            // Default: return the FRONTEND_URL or reject
            return null;
        },
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["Content-Length", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
        maxAge: 600,
    }),
);

// Logging
app.use("*", logger());

// Security middleware (after CORS)
app.use("*", securityHeaders);
app.use("*", requestValidation);

// Rate limiting
app.use("/api/auth/*", authRateLimit);
app.use("/api/upload/*", uploadRateLimit);
app.use("/api/*", generalRateLimit);

// Body size limits
app.use("/api/upload/*", uploadBodyLimit);
app.use("/api/*", jsonBodyLimit);

// Better-Auth Routes - handle all methods
app.all("/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
});

// Routes
app.route("/health", healthRoute);
app.route("/api/me", meRoute);
app.route("/api/posts", postsRoute);
app.route("/api/publish", publishRoute);
app.route("/api/tags", tagsRoute);
app.route("/api/upload", uploadRoute);
app.route("/api/comments", commentsRoute);
app.route("/api/users", usersRoute);

// Root endpoint
app.get("/", (c) => {
    return c.json({
        message: "Blog API - Auth-Based Technical Blogging Platform",
        version: "1.0.0",
        endpoints: {
            health: "/health",
            auth: "/api/auth/*",
            me: "/api/me",
            posts: "/api/posts",
            publish: "/api/publish",
            tags: "/api/tags",
            upload: "/api/upload",
            comments: "/api/comments",
            users: "/api/users",
        },
    });
});

// 404 handler
app.notFound((c) => {
    return c.json({ error: "Not Found", path: c.req.path }, 404);
});

// Error handler with specific error types
app.onError((err, c) => {
    // Handle Hono HTTP exceptions (validation errors, auth errors, etc.)
    if (err instanceof HTTPException) {
        return c.json(
            {
                error: err.message,
                status: err.status,
            },
            err.status,
        );
    }

    // Handle Prisma/database errors
    if (err.name === "PrismaClientKnownRequestError") {
        console.error(`Database error: ${err.message}`);
        return c.json(
            {
                error: "Database operation failed",
                code: (err as { code?: string }).code,
            },
            400,
        );
    }

    // Handle validation errors (Zod, etc.)
    if (err.name === "ZodError") {
        return c.json(
            {
                error: "Validation failed",
                details: isProduction ? undefined : err.message,
            },
            400,
        );
    }

    // Generic server error
    console.error(`Unhandled error: ${err.message}`, err.stack);
    return c.json(
        {
            error: "Internal Server Error",
            message: isProduction ? undefined : err.message,
        },
        500,
    );
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    try {
        await disconnectDatabase();
        console.log("Graceful shutdown completed");
        process.exit(0);
    } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
    }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default {
    port: process.env.PORT || 3001,
    fetch: app.fetch,
};
