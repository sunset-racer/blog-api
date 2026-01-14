import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, type AuthContext } from "@/middleware/auth";

const users = new Hono<AuthContext>();

// GET /api/users - List all users (admin only)
users.get("/", requireAuth, requireRole("ADMIN"), async (c) => {
    const { search, role, page = "1", limit = "20" } = c.req.query();

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
        ];
    }

    if (role && ["ADMIN", "AUTHOR", "READER"].includes(role)) {
        where.role = role;
    }

    // Get users with counts
    const [usersData, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                emailVerified: true,
                createdAt: true,
                _count: {
                    select: {
                        posts: true,
                        comments: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limitNum,
        }),
        prisma.user.count({ where }),
    ]);

    return c.json({
        users: usersData,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
        },
    });
});

// GET /api/users/:id - Get user by ID (admin only)
users.get("/:id", requireAuth, requireRole("ADMIN"), async (c) => {
    const { id } = c.req.param();

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            profile: {
                select: {
                    bio: true,
                    website: true,
                },
            },
            _count: {
                select: {
                    posts: true,
                    comments: true,
                },
            },
        },
    });

    if (!user) {
        return c.json({ error: "User not found" }, 404);
    }

    return c.json(user);
});

// Update role schema
const updateRoleSchema = z.object({
    role: z.enum(["ADMIN", "AUTHOR", "READER"]),
});

// PATCH /api/users/:id/role - Update user role (admin only)
users.patch(
    "/:id/role",
    requireAuth,
    requireRole("ADMIN"),
    zValidator("json", updateRoleSchema),
    async (c) => {
        const { id } = c.req.param();
        const { role } = c.req.valid("json");
        const currentUser = c.get("user");

        // Prevent admin from changing their own role
        if (id === currentUser.id) {
            return c.json({ error: "Cannot change your own role" }, 400);
        }

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
        });

        if (!existingUser) {
            return c.json({ error: "User not found" }, 404);
        }

        // Update the user's role
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { role },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                emailVerified: true,
                createdAt: true,
                _count: {
                    select: {
                        posts: true,
                        comments: true,
                    },
                },
            },
        });

        return c.json(updatedUser);
    }
);

export default users;
