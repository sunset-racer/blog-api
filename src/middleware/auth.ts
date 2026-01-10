import { Context, Next } from "hono";
import { auth } from "@/lib/auth";

// Extend Hono's context with user info
export type AuthContext = {
  Variables: {
    user: {
      id: string;
      email: string;
      role: string;
      name: string | null;
      emailVerified: boolean;
    };
    session: {
      id: string;
      expiresAt: Date;
      token: string;
      userId: string;
    };
  };
};

/**
 * Middleware to require authentication
 * Validates session and attaches user to context
 */
export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401);
  }

  // Attach user and session to context
  c.set("user", session.user);
  c.set("session", session.session);

  await next();
}

/**
 * Middleware to require specific role(s)
 * Must be used after requireAuth
 */
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized", message: "Authentication required" }, 401);
    }

    const userRole = user.role;

    if (!allowedRoles.includes(userRole)) {
      return c.json(
        {
          error: "Forbidden",
          message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Optional auth middleware - attaches user if authenticated, but doesn't require it
 */
export async function optionalAuth(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session) {
      c.set("user", session.user);
      c.set("session", session.session);
    }
  } catch (error) {
    // Ignore errors, this is optional auth
  }

  await next();
}
