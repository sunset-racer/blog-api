import type { Context, Next } from "hono";

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis for distributed rate limiting
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// Store for rate limit tracking (IP -> entry)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean up every minute

interface RateLimitOptions {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Time window in milliseconds */
    windowMs: number;
    /** Custom key generator (default: IP address) */
    keyGenerator?: (c: Context) => string;
    /** Custom message for rate limit exceeded */
    message?: string;
    /** Skip rate limiting for certain requests */
    skip?: (c: Context) => boolean;
}

/**
 * Creates a rate limiting middleware
 */
export function rateLimiter(options: RateLimitOptions) {
    const {
        limit,
        windowMs,
        keyGenerator = (c) => getClientIP(c),
        message = "Too many requests, please try again later",
        skip,
    } = options;

    return async (c: Context, next: Next) => {
        // Skip if configured
        if (skip && skip(c)) {
            return next();
        }

        const key = keyGenerator(c);
        const now = Date.now();

        let entry = rateLimitStore.get(key);

        // Initialize or reset if window expired
        if (!entry || entry.resetTime < now) {
            entry = {
                count: 0,
                resetTime: now + windowMs,
            };
        }

        entry.count++;
        rateLimitStore.set(key, entry);

        // Calculate remaining
        const remaining = Math.max(0, limit - entry.count);
        const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

        // Set rate limit headers
        c.header("X-RateLimit-Limit", limit.toString());
        c.header("X-RateLimit-Remaining", remaining.toString());
        c.header("X-RateLimit-Reset", resetSeconds.toString());

        // Check if limit exceeded
        if (entry.count > limit) {
            c.header("Retry-After", resetSeconds.toString());
            return c.json(
                {
                    error: "Rate limit exceeded",
                    message,
                    retryAfter: resetSeconds,
                },
                429
            );
        }

        return next();
    };
}

/**
 * Get client IP address from request
 */
function getClientIP(c: Context): string {
    const trustProxy = process.env.TRUST_PROXY === "true";
    if (trustProxy) {
        // Check common proxy headers (Render uses x-forwarded-for)
        const forwarded = c.req.header("x-forwarded-for");
        if (forwarded) {
            const firstIP = forwarded.split(",")[0];
            if (firstIP) return firstIP.trim();
        }

        const realIP = c.req.header("x-real-ip");
        if (realIP) {
            return realIP;
        }

        // Fallback to CF header if using Cloudflare
        const cfIP = c.req.header("cf-connecting-ip");
        if (cfIP) {
            return cfIP;
        }
    }

    // Generate a unique identifier based on request characteristics
    // This prevents all unknown clients from sharing one rate limit bucket
    const userAgent = c.req.header("user-agent") || "";
    const acceptLanguage = c.req.header("accept-language") || "";
    const fingerprint = `unknown-${hashString(userAgent + acceptLanguage)}`;
    return fingerprint;
}

/**
 * Simple hash function for fingerprinting
 */
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

// Pre-configured rate limiters for different use cases

/** General API rate limiter - 100 requests per minute */
export const generalRateLimit = rateLimiter({
    limit: 100,
    windowMs: 60 * 1000, // 1 minute
});

/** Auth rate limiter - stricter for auth endpoints */
export const authRateLimit = rateLimiter({
    limit: process.env.NODE_ENV === "development" ? 50 : 30, // 30 attempts per 5 min in prod
    windowMs: process.env.NODE_ENV === "development" ? 60 * 1000 : 5 * 60 * 1000, // 1 min in dev, 5 min in prod
    message: "Too many authentication attempts, please try again later",
});

/** Upload rate limiter - 20 uploads per hour */
export const uploadRateLimit = rateLimiter({
    limit: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    message: "Upload limit reached, please try again later",
});

/** Write operations rate limiter - 30 per minute */
export const writeRateLimit = rateLimiter({
    limit: 30,
    windowMs: 60 * 1000, // 1 minute
    message: "Too many write operations, please slow down",
});

/** Strict rate limiter for sensitive operations - 5 per minute */
export const strictRateLimit = rateLimiter({
    limit: 5,
    windowMs: 60 * 1000, // 1 minute
    message: "Rate limit exceeded for sensitive operation",
});
