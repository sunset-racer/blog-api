import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// PostgreSQL connection pool for Supabase
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}

// Configure connection pool with appropriate limits
const pool = new Pool({
    connectionString,
    max: 10, // Maximum number of connections in the pool
    min: 2, // Minimum number of connections to maintain
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Timeout after 10 seconds when acquiring connection
});

// Handle pool errors
pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
});

const adapter = new PrismaPg(pool);

// Prisma Client singleton with PostgreSQL adapter
const prismaClientSingleton = () => {
    return new PrismaClient({ adapter });
};

declare global {
    // eslint-disable-next-line no-var
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export { prisma, pool };

if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = prisma;
}

// Graceful shutdown function
export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    await pool.end();
    console.log("Database connections closed");
}
