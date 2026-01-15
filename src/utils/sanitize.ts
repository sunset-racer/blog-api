/**
 * Input sanitization utilities
 * Provides functions to sanitize user input beyond Zod validation
 */

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;",
    };

    return str.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] ?? char);
}

/**
 * Remove HTML tags from string
 */
export function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize string for safe display (escape HTML but allow markdown)
 * Use this for content that will be rendered as markdown
 */
export function sanitizeMarkdown(str: string): string {
    // Remove potentially dangerous HTML tags but keep markdown-compatible content
    // Allow safe tags: p, br, strong, em, code, pre, ul, ol, li, blockquote, h1-h6, a, img

    const dangerousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
        /<embed\b[^>]*>/gi,
        /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
        /<input\b[^>]*>/gi,
        /<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi,
        /<textarea\b[^<]*(?:(?!<\/textarea>)<[^<]*)*<\/textarea>/gi,
        /<select\b[^<]*(?:(?!<\/select>)<[^<]*)*<\/select>/gi,
        /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
        /<link\b[^>]*>/gi,
        /<meta\b[^>]*>/gi,
        /<base\b[^>]*>/gi,
    ];

    let sanitized = str;
    for (const pattern of dangerousPatterns) {
        sanitized = sanitized.replace(pattern, "");
    }

    // Remove event handlers from any remaining HTML
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "");

    // Remove javascript: and data: URLs
    sanitized = sanitized.replace(/javascript\s*:/gi, "");
    sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, "");
    sanitized = sanitized.replace(/vbscript\s*:/gi, "");

    return sanitized;
}

/**
 * Sanitize plain text input (no HTML allowed)
 * Use this for names, titles, etc.
 */
export function sanitizeText(str: string): string {
    return stripHtml(str).trim();
}

/**
 * Sanitize and normalize slug
 */
export function sanitizeSlug(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Sanitize email (lowercase and trim)
 */
export function sanitizeEmail(str: string): string {
    return str.toLowerCase().trim();
}

/**
 * Sanitize URL - ensure it's a valid HTTP(S) URL
 */
export function sanitizeUrl(str: string): string | null {
    try {
        const url = new URL(str);

        // Only allow http and https protocols
        if (!["http:", "https:"].includes(url.protocol)) {
            return null;
        }

        // Block javascript: and data: URLs that might have slipped through
        if (
            url.href.toLowerCase().includes("javascript:") ||
            url.href.toLowerCase().includes("data:text/html")
        ) {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9.-]/g, "_") // Replace unsafe characters
        .replace(/\.{2,}/g, ".") // Prevent path traversal
        .replace(/^\.+/, "") // Remove leading dots
        .substring(0, 255); // Limit length
}

/**
 * Check for SQL injection patterns (defense in depth - Prisma already handles this)
 */
export function hasSqlInjectionPatterns(str: string): boolean {
    const patterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b)/i,
        /(\b(UNION|JOIN)\b.*\b(SELECT)\b)/i,
        /(--|\#|\/\*)/,
        /(\bOR\b|\bAND\b).*=/i,
        /'\s*(OR|AND)\s*'/i,
        /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/i,
    ];

    return patterns.some((pattern) => pattern.test(str));
}

/**
 * Sanitize object - recursively sanitize all string values
 */
export function sanitizeObject<T extends Record<string, unknown>>(
    obj: T,
    options: {
        stripHtml?: boolean;
        escapeHtml?: boolean;
    } = {}
): T {
    const { stripHtml: shouldStripHtml = false, escapeHtml: shouldEscapeHtml = false } = options;

    const result: Record<string, unknown> = { ...obj };

    for (const key in result) {
        const value = result[key];

        if (typeof value === "string") {
            let sanitized = value;
            if (shouldStripHtml) {
                sanitized = stripHtml(sanitized);
            }
            if (shouldEscapeHtml) {
                sanitized = escapeHtml(sanitized);
            }
            result[key] = sanitized.trim();
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
            result[key] = sanitizeObject(
                value as Record<string, unknown>,
                options
            );
        }
    }

    return result as T;
}
