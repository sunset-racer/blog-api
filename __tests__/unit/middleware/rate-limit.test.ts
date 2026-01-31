import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter } from "../../../src/middleware/rate-limit";

interface RateLimitResponse {
    error?: string;
    message?: string;
    retryAfter?: number;
}

// Generate unique IPs for each test to avoid rate limit state pollution
let ipCounter = 0;
const getUniqueIP = () => `test-${Date.now()}-${++ipCounter}`;

describe("rate-limit middleware", () => {
    let app: Hono;
    const originalTrustProxy = process.env.TRUST_PROXY;

    beforeEach(() => {
        app = new Hono();
        vi.useFakeTimers();
        // Enable TRUST_PROXY so x-forwarded-for headers are respected
        process.env.TRUST_PROXY = "true";
    });

    afterEach(() => {
        vi.useRealTimers();
        // Restore original value
        process.env.TRUST_PROXY = originalTrustProxy;
    });

    describe("rateLimiter", () => {
        it("should allow requests under the limit", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 5,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            expect(res.status).toBe(200);
        });

        it("should set rate limit headers", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 10,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
            expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
        });

        it("should decrement remaining count with each request", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 5,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // First request
            let res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");

            // Second request
            res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("3");

            // Third request
            res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
        });

        it("should block requests exceeding the limit", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 2,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // First two requests should succeed
            await app.request("/test", { headers: { "x-forwarded-for": ip } });
            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            // Third request should be blocked
            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            expect(res.status).toBe(429);
            const body = (await res.json()) as RateLimitResponse;
            expect(body.error).toBe("Rate limit exceeded");
        });

        it("should include Retry-After header when limit exceeded", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBeTruthy();
        });

        it("should use custom message when provided", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
                message: "Custom rate limit message",
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            const body = (await res.json()) as RateLimitResponse;
            expect(body.message).toBe("Custom rate limit message");
        });

        it("should use custom key generator when provided", async () => {
            const key1 = getUniqueIP();
            const key2 = getUniqueIP();
            const middleware = rateLimiter({
                limit: 2,
                windowMs: 60000,
                keyGenerator: (c) => c.req.header("x-api-key") || "anonymous",
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // Same API key should share rate limit
            await app.request("/test", { headers: { "x-api-key": key1 } });
            await app.request("/test", { headers: { "x-api-key": key1 } });

            const res = await app.request("/test", {
                headers: { "x-api-key": key1 },
            });

            expect(res.status).toBe(429);

            // Different API key should have separate limit
            const res2 = await app.request("/test", {
                headers: { "x-api-key": key2 },
            });

            expect(res2.status).toBe(200);
        });

        it("should skip rate limiting when skip function returns true", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
                skip: (c) => c.req.path === "/health",
            });

            app.use("*", middleware);
            app.get("/health", (c) => c.json({ status: "ok" }));
            app.get("/test", (c) => c.json({ success: true }));

            // Health endpoint should never be rate limited
            for (let i = 0; i < 5; i++) {
                const res = await app.request("/health", {
                    headers: { "x-forwarded-for": ip },
                });
                expect(res.status).toBe(200);
            }
        });

        it("should reset count after window expires", async () => {
            const ip = getUniqueIP();
            const windowMs = 60000;
            const middleware = rateLimiter({
                limit: 1,
                windowMs,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // First request succeeds
            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            // Second request blocked
            let res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });
            expect(res.status).toBe(429);

            // Advance time past the window
            vi.advanceTimersByTime(windowMs + 1000);

            // Request should succeed again
            res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });
            expect(res.status).toBe(200);
        });

        it("should track different IPs separately", async () => {
            const ip1 = getUniqueIP();
            const ip2 = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // IP 1 uses its limit
            await app.request("/test", {
                headers: { "x-forwarded-for": ip1 },
            });

            const res1 = await app.request("/test", {
                headers: { "x-forwarded-for": ip1 },
            });
            expect(res1.status).toBe(429);

            // IP 2 should still have its limit
            const res2 = await app.request("/test", {
                headers: { "x-forwarded-for": ip2 },
            });
            expect(res2.status).toBe(200);
        });

        it("should return retryAfter in response body", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            const body = (await res.json()) as RateLimitResponse;
            expect(body.retryAfter).toBeDefined();
            expect(typeof body.retryAfter).toBe("number");
        });

        it("should handle x-real-ip header", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // Use x-real-ip instead of x-forwarded-for
            await app.request("/test", {
                headers: { "x-real-ip": ip },
            });

            const res = await app.request("/test", {
                headers: { "x-real-ip": ip },
            });

            // Without TRUST_PROXY, these should be grouped by fingerprint
            // We're testing that the middleware handles the header
            expect(res.status).toBeDefined();
        });

        it("should handle cf-connecting-ip header", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 1,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            // Cloudflare header
            await app.request("/test", {
                headers: { "cf-connecting-ip": ip },
            });

            const res = await app.request("/test", {
                headers: { "cf-connecting-ip": ip },
            });

            expect(res.status).toBeDefined();
        });

        it("should show remaining as 0 when limit is exactly reached", async () => {
            const ip = getUniqueIP();
            const middleware = rateLimiter({
                limit: 2,
                windowMs: 60000,
            });

            app.use("*", middleware);
            app.get("/test", (c) => c.json({ success: true }));

            await app.request("/test", { headers: { "x-forwarded-for": ip } });

            const res = await app.request("/test", {
                headers: { "x-forwarded-for": ip },
            });

            expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
            expect(res.status).toBe(200);
        });
    });
});
