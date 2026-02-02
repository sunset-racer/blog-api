import { Hono } from "hono";
import type { PrismaClient } from "../../generated/prisma/client";

export const createHealthRoute = (db: PrismaClient) => {
    const health = new Hono();

    health.get("/", async (c) => {
        try {
            // Test database connection
            await db.$queryRaw`SELECT 1`;

            return c.json({
                status: "ok",
                timestamp: new Date().toISOString(),
                database: "connected",
            });
        } catch (error) {
            return c.json(
                {
                    status: "error",
                    timestamp: new Date().toISOString(),
                    database: "disconnected",
                    error: error instanceof Error ? error.message : "Unknown error",
                },
                503,
            );
        }
    });

    return health;
};

// For backward compatibility with existing imports
import { prisma } from "@/lib/prisma";
export default createHealthRoute(prisma);
