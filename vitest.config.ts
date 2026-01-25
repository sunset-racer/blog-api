import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        // Test environment
        environment: "node",

        // Setup file run before each test file
        setupFiles: ["./__tests__/setup/test-utils.ts"],

        // Include patterns
        include: ["__tests__/**/*.test.ts", "__tests__/**/*.spec.ts"],

        // Exclude patterns
        exclude: ["node_modules", "generated", "dist"],

        // Coverage configuration
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "lcov"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "generated/**", "**/__tests__/**"],
            thresholds: {
                global: {
                    statements: 80,
                    branches: 75,
                    functions: 80,
                    lines: 80,
                },
            },
        },

        // Timeout for async operations
        testTimeout: 10000,
        hookTimeout: 10000,

        // Reporter
        reporters: ["default"],

        // Mock configuration
        clearMocks: true,
        restoreMocks: true,
        mockReset: true,

        // Globals (describe, it, expect available without import)
        globals: true,
    },
});
