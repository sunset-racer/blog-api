import { Hono } from "hono";
import { requireAuth, type AuthContext } from "@/middleware/auth";

const me = new Hono<AuthContext>();

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

export default me;
