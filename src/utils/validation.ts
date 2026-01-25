import type { Context } from "hono";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

/**
 * Validates request body against a Zod schema
 * Returns parsed data or sends error response
 */
export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<T | null> {
    try {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            c.status(400);
            c.json({ error: "Invalid JSON" });
            return null;
        }
        const validated = schema.parse(body);
        return validated;
    } catch (error) {
        if (error instanceof ZodError) {
            c.status(400);
            c.json({
                error: "Validation Error",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            });
            return null;
        }
        throw error;
    }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T>(c: Context, schema: ZodSchema<T>): T | null {
    try {
        const query = c.req.query();
        const validated = schema.parse(query);
        return validated;
    } catch (error) {
        if (error instanceof ZodError) {
            c.status(400);
            c.json({
                error: "Validation Error",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            });
            return null;
        }
        throw error;
    }
}

/**
 * Validates path parameters against a Zod schema
 */
export function validateParams<T>(c: Context, schema: ZodSchema<T>): T | null {
    try {
        const params = c.req.param();
        const validated = schema.parse(params);
        return validated;
    } catch (error) {
        if (error instanceof ZodError) {
            c.status(400);
            c.json({
                error: "Validation Error",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            });
            return null;
        }
        throw error;
    }
}
