import type { Context, Next } from "hono";

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

// Type for the auth dependency - flexible to support both real and mock auth
export interface AuthDependency {
    api: {
        getSession: (options: { headers: Headers }) => Promise<{
            user: {
                id: string;
                email: string;
                role?: string | null;
                name?: string | null;
                emailVerified?: boolean;
                [key: string]: any;
            };
            session: {
                id: string;
                expiresAt: Date;
                token: string;
                userId: string;
                [key: string]: any;
            };
        } | null>;
    };
}

/**
 * Creates auth middleware with dependency injection
 */
export function createAuthMiddleware(authDep: AuthDependency) {
    /**
     * Middleware to require authentication
     * Validates session and attaches user to context
     */
    async function requireAuth(c: Context, next: Next): Promise<Response | void> {
        let session: Awaited<ReturnType<typeof authDep.api.getSession>> | null = null;
        try {
            session = await authDep.api.getSession({
                headers: c.req.raw.headers,
            });
        } catch {
            return c.json({ error: "Unauthorized", message: "Authentication required" }, 401);
        }

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
    function requireRole(...allowedRoles: string[]) {
        return async (c: Context, next: Next): Promise<Response | void> => {
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
                    403,
                );
            }

            await next();
        };
    }

    /**
     * Optional auth middleware - attaches user if authenticated, but doesn't require it
     */
    async function optionalAuth(c: Context, next: Next): Promise<void> {
        try {
            const session = await authDep.api.getSession({
                headers: c.req.raw.headers,
            });

            if (session) {
                c.set("user", session.user);
                c.set("session", session.session);
            }
        } catch {
            // Ignore errors, this is optional auth
        }

        await next();
    }

    return {
        requireAuth,
        requireRole,
        optionalAuth,
    };
}

// Backwards compatibility - export default instances using real auth
import { auth } from "@/lib/auth";
const defaultMiddleware = createAuthMiddleware(auth);
export const requireAuth = defaultMiddleware.requireAuth;
export const requireRole = defaultMiddleware.requireRole;
export const optionalAuth = defaultMiddleware.optionalAuth;
