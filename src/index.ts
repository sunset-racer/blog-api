import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "@/lib/auth";
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
app.use(
    "*",
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["Content-Length"],
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

// Error handler
app.onError((err, c) => {
    console.error(`Error: ${err.message}`);
    return c.json(
        {
            error: "Internal Server Error",
            message: process.env.NODE_ENV === "development" ? err.message : undefined,
        },
        500,
    );
});

export default {
    port: process.env.PORT || 3001,
    fetch: app.fetch,
};
