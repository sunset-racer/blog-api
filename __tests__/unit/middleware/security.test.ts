import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
    securityHeaders,
    requestValidation,
    bodySizeLimit,
    jsonBodyLimit,
    uploadBodyLimit,
} from "../../../src/middleware/security";

interface ErrorResponse {
    error: string;
    maxSize?: string;
    receivedSize?: string;
}

describe("security middleware", () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
    });

    describe("securityHeaders", () => {
        beforeEach(() => {
            app.use("*", securityHeaders);
            app.get("/test", (c) => c.json({ success: true }));
            app.get("/api/me/profile", (c) => c.json({ user: "test" }));
            app.get("/api/auth/session", (c) => c.json({ session: "test" }));
        });

        it("should add X-Frame-Options header", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("X-Frame-Options")).toBe("DENY");
        });

        it("should add X-Content-Type-Options header", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        });

        it("should add X-XSS-Protection header", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
        });

        it("should add Referrer-Policy header", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        });

        it("should add Content-Security-Policy header", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("Content-Security-Policy")).toBe(
                "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
            );
        });

        it("should add Permissions-Policy header", async () => {
            const res = await app.request("/test");
            const permissionsPolicy = res.headers.get("Permissions-Policy");
            expect(permissionsPolicy).toContain("accelerometer=()");
            expect(permissionsPolicy).toContain("camera=()");
            expect(permissionsPolicy).toContain("geolocation=()");
            expect(permissionsPolicy).toContain("microphone=()");
        });

        it("should add cache control headers for /api/me paths", async () => {
            const res = await app.request("/api/me/profile");
            expect(res.headers.get("Cache-Control")).toBe(
                "no-store, no-cache, must-revalidate, proxy-revalidate"
            );
            expect(res.headers.get("Pragma")).toBe("no-cache");
            expect(res.headers.get("Expires")).toBe("0");
        });

        it("should add cache control headers for /api/auth paths", async () => {
            const res = await app.request("/api/auth/session");
            expect(res.headers.get("Cache-Control")).toBe(
                "no-store, no-cache, must-revalidate, proxy-revalidate"
            );
        });

        it("should not add cache control headers for regular paths", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("Cache-Control")).toBeNull();
            expect(res.headers.get("Pragma")).toBeNull();
        });

        it("should add HSTS header in production", async () => {
            const originalEnv = process.env.NODE_ENV;
            Object.assign(process.env, { NODE_ENV: "production" });

            const prodApp = new Hono();
            prodApp.use("*", securityHeaders);
            prodApp.get("/test", (c) => c.json({ success: true }));

            const res = await prodApp.request("/test");
            expect(res.headers.get("Strict-Transport-Security")).toBe(
                "max-age=31536000; includeSubDomains; preload"
            );

            Object.assign(process.env, { NODE_ENV: originalEnv });
        });

        it("should not add HSTS header in development", async () => {
            const res = await app.request("/test");
            expect(res.headers.get("Strict-Transport-Security")).toBeNull();
        });
    });

    describe("requestValidation", () => {
        beforeEach(() => {
            app.use("*", requestValidation);
            app.get("/test", (c) => c.json({ success: true }));
            app.get("/api/posts", (c) => c.json({ posts: [] }));
            app.post("/api/posts", (c) => c.json({ created: true }));
            app.post("/api/auth/login", (c) => c.json({ logged: true }));
        });

        describe("blocked paths", () => {
            const blockedPaths = [
                "/wp-admin",
                "/wp-login",
                "/xmlrpc.php",
                "/phpmyadmin",
                "/.env",
                "/.git",
                "/config.php",
                "/admin.php",
                "/.htaccess",
                "/web.config",
            ];

            it.each(blockedPaths)("should block %s path", async (path) => {
                const res = await app.request(path);
                expect(res.status).toBe(403);
                const body = (await res.json()) as ErrorResponse;
                expect(body.error).toBe("Forbidden");
            });

            it("should block nested attack paths", async () => {
                const res = await app.request("/api/wp-admin/test");
                expect(res.status).toBe(403);
            });

            it("should be case-insensitive for blocked paths", async () => {
                const res = await app.request("/WP-ADMIN");
                expect(res.status).toBe(403);
            });
        });

        describe("suspicious query parameters", () => {
            it("should block script tags in query params", async () => {
                const res = await app.request("/test?search=<script>alert(1)</script>");
                expect(res.status).toBe(400);
                const body = (await res.json()) as ErrorResponse;
                expect(body.error).toBe("Invalid request");
            });

            it("should block javascript: URLs in query params", async () => {
                const res = await app.request("/test?url=javascript:alert(1)");
                expect(res.status).toBe(400);
            });

            it("should block data:text/html in query params", async () => {
                const res = await app.request(
                    "/test?content=data:text/html,<script>alert(1)</script>"
                );
                expect(res.status).toBe(400);
            });

            it("should block onerror event handlers", async () => {
                const res = await app.request('/test?img=<img onerror="alert(1)">');
                expect(res.status).toBe(400);
            });

            it("should block onload event handlers", async () => {
                const res = await app.request('/test?body=<body onload="evil()">');
                expect(res.status).toBe(400);
            });

            it("should block encoded malicious params", async () => {
                const encoded = encodeURIComponent("<script>alert(1)</script>");
                const res = await app.request(`/test?q=${encoded}`);
                expect(res.status).toBe(400);
            });

            it("should allow safe query parameters", async () => {
                const res = await app.request("/api/posts?page=1&limit=10&search=javascript");
                expect(res.status).toBe(200);
            });

            it("should reject malformed URL encoding", async () => {
                const res = await app.request("/test?q=%E0%A4%A");
                expect(res.status).toBe(400);
            });
        });

        describe("content-type validation", () => {
            it("should allow POST with application/json", async () => {
                const res = await app.request("/api/posts", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": "20",
                    },
                    body: JSON.stringify({ title: "Test" }),
                });
                expect(res.status).toBe(200);
            });

            it("should allow multipart/form-data for uploads", async () => {
                app.post("/api/upload", (c) => c.json({ uploaded: true }));

                const formData = new FormData();
                formData.append("file", new Blob(["test"]), "test.txt");

                const res = await app.request("/api/upload", {
                    method: "POST",
                    body: formData,
                });
                expect(res.status).toBe(200);
            });

            it("should allow /api/auth endpoints without JSON content-type", async () => {
                const res = await app.request("/api/auth/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": "20",
                    },
                    body: "username=test&password=test",
                });
                expect(res.status).toBe(200);
            });

            it("should allow empty body requests without content-type", async () => {
                const res = await app.request("/api/posts", {
                    method: "POST",
                    headers: {
                        "Content-Length": "0",
                    },
                });
                expect(res.status).toBe(200);
            });
        });
    });

    describe("bodySizeLimit", () => {
        it("should allow requests under the limit", async () => {
            const middleware = bodySizeLimit(1024); // 1KB
            app.use("*", middleware);
            app.post("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": "100",
                },
                body: "x".repeat(100),
            });

            expect(res.status).toBe(200);
        });

        it("should block requests exceeding the limit", async () => {
            const middleware = bodySizeLimit(100); // 100 bytes
            app.use("*", middleware);
            app.post("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": "200",
                },
                body: "x".repeat(200),
            });

            expect(res.status).toBe(413);
            const body = (await res.json()) as ErrorResponse;
            expect(body.error).toBe("Payload too large");
        });

        it("should include size information in error response", async () => {
            const middleware = bodySizeLimit(1024 * 1024); // 1MB
            app.use("*", middleware);
            app.post("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": (2 * 1024 * 1024).toString(), // 2MB
                },
            });

            expect(res.status).toBe(413);
            const body = (await res.json()) as ErrorResponse;
            expect(body.maxSize).toBe("1MB");
            expect(body.receivedSize).toBe("2.00MB");
        });

        it("should allow requests without Content-Length header", async () => {
            const middleware = bodySizeLimit(1024);
            app.use("*", middleware);
            app.post("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                method: "POST",
            });

            expect(res.status).toBe(200);
        });

        it("should handle exactly at limit", async () => {
            const middleware = bodySizeLimit(100);
            app.use("*", middleware);
            app.post("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": "100",
                },
            });

            expect(res.status).toBe(200);
        });
    });

    describe("pre-configured limits", () => {
        it("jsonBodyLimit should be 1MB", async () => {
            app.use("*", jsonBodyLimit);
            app.post("/test", (c) => c.json({ success: true }));

            // Under limit - should pass
            const res1 = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": (500 * 1024).toString(), // 500KB
                },
            });
            expect(res1.status).toBe(200);

            // Over limit - should fail
            const res2 = await app.request("/test", {
                method: "POST",
                headers: {
                    "Content-Length": (2 * 1024 * 1024).toString(), // 2MB
                },
            });
            expect(res2.status).toBe(413);
        });

        it("uploadBodyLimit should be 10MB", async () => {
            app.use("*", uploadBodyLimit);
            app.post("/upload", (c) => c.json({ success: true }));

            // Under limit - should pass
            const res1 = await app.request("/upload", {
                method: "POST",
                headers: {
                    "Content-Length": (5 * 1024 * 1024).toString(), // 5MB
                },
            });
            expect(res1.status).toBe(200);

            // Over limit - should fail
            const res2 = await app.request("/upload", {
                method: "POST",
                headers: {
                    "Content-Length": (15 * 1024 * 1024).toString(), // 15MB
                },
            });
            expect(res2.status).toBe(413);
        });
    });
});
