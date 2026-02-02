import { Hono } from "hono";
import { createAuthMiddleware, type AuthContext, type AuthDependency } from "@/middleware/auth";

export const createMeRoute = (authDep: AuthDependency) => {
    const me = new Hono<AuthContext>();
    const { requireAuth } = createAuthMiddleware(authDep);

    // Apply auth middleware to all routes
    me.use("*", requireAuth);

    // Get current user info
    me.get("/", (c) => {
        const user = c.get("user");
        const session = c.get("session");

        return c.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                emailVerified: user.emailVerified,
            },
            session: {
                expiresAt: session.expiresAt,
            },
        });
    });

    return me;
};

// For backward compatibility with existing imports
import { auth } from "@/lib/auth";
export default createMeRoute(auth);
