import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { prismaMock } from "../../setup/mocks/prisma";
import { createHealthRoute } from "../../../src/routes/health";

describe("Health Route", () => {
    let app: Hono;

    beforeEach(() => {
        // Mock reset handled by setup
        app = new Hono();
        // Create route with mock Prisma client
        const healthRoute = createHealthRoute(prismaMock);
        app.route("/health", healthRoute);
    });

    describe("GET /health", () => {
        it("should return 200 with status ok when database is connected", async () => {
            // Mock successful database query
            prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

            const res = await app.request("/health");
            const body: any = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("ok");
            expect(body.database).toBe("connected");
            expect(body.timestamp).toBeDefined();
        });

        it("should return 503 when database connection fails", async () => {
            // Mock database connection failure
            prismaMock.$queryRaw.mockRejectedValue(new Error("Connection refused"));

            const res = await app.request("/health");
            const body: any = await res.json();

            expect(res.status).toBe(503);
            expect(body.status).toBe("error");
            expect(body.database).toBe("disconnected");
            expect(body.error).toBe("Connection refused");
            expect(body.timestamp).toBeDefined();
        });

        it("should handle unknown errors gracefully", async () => {
            // Mock with non-Error rejection
            prismaMock.$queryRaw.mockRejectedValue("Unknown failure");

            const res = await app.request("/health");
            const body: any = await res.json();

            expect(res.status).toBe(503);
            expect(body.status).toBe("error");
            expect(body.database).toBe("disconnected");
            expect(body.error).toBe("Unknown error");
        });

        it("should include ISO timestamp in response", async () => {
            prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

            const res = await app.request("/health");
            const body: any = await res.json();

            // Verify timestamp is valid ISO format
            const timestamp = new Date(body.timestamp);
            expect(timestamp.toISOString()).toBe(body.timestamp);
        });
    });
});
