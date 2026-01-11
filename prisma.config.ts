// Prisma 7 Configuration
// Run Prisma commands using: bun --bun run prisma [command]
import { defineConfig, env } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: env("DIRECT_URL"), // Direct connection for migrations
    },
});
