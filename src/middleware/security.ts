import type { Context, Next } from "hono";

/**
 * Security headers middleware
 * Adds important security headers to all responses
 */
export async function securityHeaders(c: Context, next: Next) {
    await next();

    // Prevent clickjacking attacks
    c.header("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    c.header("X-Content-Type-Options", "nosniff");

    // Enable XSS filter in older browsers
    c.header("X-XSS-Protection", "1; mode=block");

    // Control referrer information
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Prevent browser from caching sensitive data
    // Only apply to API responses, not public content
    if (c.req.path.startsWith("/api/me") || c.req.path.startsWith("/api/auth")) {
        c.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        c.header("Pragma", "no-cache");
        c.header("Expires", "0");
    }

    // Content Security Policy - restrictive for API
    c.header(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
    );

    // Permissions Policy - disable unnecessary features
    c.header(
        "Permissions-Policy",
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    );

    // Strict Transport Security (only in production with HTTPS)
    if (process.env.NODE_ENV === "production") {
        c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
}

/**
 * Request validation middleware
 * Validates incoming requests for common attack patterns
 */
export async function requestValidation(c: Context, next: Next) {
    const path = c.req.path;
    const method = c.req.method;

    // Block common attack paths
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

    if (blockedPaths.some((blocked) => path.toLowerCase().includes(blocked))) {
        return c.json({ error: "Forbidden" }, 403);
    }

    // Block requests with suspicious query parameters
    const url = new URL(c.req.url);
    const suspiciousParams = ["<script", "javascript:", "data:text/html", "onerror=", "onload="];

    for (const [, value] of url.searchParams) {
        const decodedValue = decodeURIComponent(value).toLowerCase();
        if (suspiciousParams.some((pattern) => decodedValue.includes(pattern))) {
            return c.json({ error: "Invalid request" }, 400);
        }
    }

    // Validate Content-Type for POST/PUT/PATCH requests
    if (["POST", "PUT", "PATCH"].includes(method)) {
        const contentType = c.req.header("content-type") || "";

        // Skip validation for multipart (file uploads)
        if (!contentType.includes("multipart/form-data")) {
            // For non-file requests, expect JSON
            if (
                !contentType.includes("application/json") &&
                !c.req.path.startsWith("/api/auth") // Auth may use form data
            ) {
                // Allow empty body requests
                const contentLength = c.req.header("content-length");
                if (contentLength && parseInt(contentLength) > 0) {
                    // Only warn, don't block (some clients may not set content-type correctly)
                    console.warn(`Unexpected Content-Type: ${contentType} for ${method} ${path}`);
                }
            }
        }
    }

    return next();
}

/**
 * Body size limit middleware
 * Prevents large payload attacks
 */
export function bodySizeLimit(maxSizeBytes: number) {
    return async (c: Context, next: Next) => {
        const contentLength = c.req.header("content-length");

        if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (size > maxSizeBytes) {
                return c.json(
                    {
                        error: "Payload too large",
                        maxSize: `${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
                        receivedSize: `${(size / 1024 / 1024).toFixed(2)}MB`,
                    },
                    413
                );
            }
        }

        return next();
    };
}

// Pre-configured body size limits
/** JSON body limit - 1MB */
export const jsonBodyLimit = bodySizeLimit(1 * 1024 * 1024);

/** Upload body limit - 10MB */
export const uploadBodyLimit = bodySizeLimit(10 * 1024 * 1024);
