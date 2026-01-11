import { Hono } from "hono";
import { prisma } from "@/lib/prisma";

const health = new Hono();

health.get("/", async (c) => {
    try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;

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

export default health;
