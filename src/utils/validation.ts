import { Context } from "hono";
import { ZodSchema, ZodError } from "zod";

/**
 * Validates request body against a Zod schema
 * Returns parsed data or sends error response
 */
export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<T | null> {
  try {
    const body = await c.req.json();
    const validated = schema.parse(body);
    return validated;
  } catch (error) {
    if (error instanceof ZodError) {
      c.status(400);
      c.json({
        error: "Validation Error",
        issues: error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
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
        issues: error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        })),
      });
      return null;
    }
    throw error;
  }
}
