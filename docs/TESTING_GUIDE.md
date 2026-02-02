# Testing Guide - Blog API

> Comprehensive guide to testing setup, patterns, and troubleshooting for the blog-api integration and unit tests.

---

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Mock Setup Architecture](#mock-setup-architecture)
4. [Running Tests](#running-tests)
5. [Writing Tests](#writing-tests)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The blog-api uses **Vitest** for testing with a comprehensive mock setup for Prisma, Better-Auth, and Supabase. Tests are divided into:

- **Unit Tests** (307 tests): Isolated component testing (middleware, schemas, utilities)
- **Integration Tests** (100 tests): Full route handler testing with mocked dependencies

### Tech Stack

- **Test Runner**: [Vitest](https://vitest.dev)
- **Mocking**: [vitest-mock-extended](https://github.com/marchaos/vitest-mock-extended)
- **Database**: Prisma with PostgreSQL
- **Auth**: Better-Auth
- **Storage**: Supabase

---

## Test Structure

```
apps/blog-api/__tests__/
├── setup/
│   ├── test-utils.ts           # Main setup file (imported by vitest.config.ts)
│   └── mocks/
│       ├── prisma.ts            # Prisma mock setup
│       ├── auth.ts              # Better-Auth mock setup
│       └── supabase.ts          # Supabase Storage mock setup
├── unit/
│   ├── middleware/              # Middleware tests
│   ├── schemas/                 # Zod schema validation tests
│   └── utils/                   # Utility function tests
└── integration/
    └── routes/                  # Full route handler tests
        ├── health.test.ts
        ├── posts.test.ts
        ├── comments.test.ts
        ├── tags.test.ts
        ├── users.test.ts
        └── publish.test.ts
```

---

## Mock Setup Architecture

### The Synchronous Mock Pattern

**Problem:** Vitest hoists `vi.mock()` calls to the top of files before imports are evaluated. If you create a mock variable and reference it in `vi.mock()`, the factory function runs before the variable is initialized, causing `undefined` errors.

**Solution:** Use the **synchronous mock module pattern**:

1. Create a separate `__mocks__` file with pre-instantiated mocks
2. Import the mock module synchronously before `vi.mock()`
3. Pass the imported module to `vi.mock()` as a synchronous factory

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ vitest.config.ts                                             │
│   setupFiles: ["./__tests__/setup/test-utils.ts"]          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ __tests__/setup/test-utils.ts                               │
│   import "./mocks/prisma";    ← Registers Prisma mock      │
│   import "./mocks/auth";      ← Registers Auth mock        │
│   import "./mocks/supabase";  ← Registers Supabase mock    │
└─────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│ Prisma Mock      │    │ Auth Mock        │
└──────────────────┘    └──────────────────┘
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│ src/lib/__mocks__│    │ src/lib/__mocks__│
│ /prisma.ts       │    │ /auth.ts         │
│                  │    │                  │
│ Creates:         │    │ Creates:         │
│ - prismaMock     │    │ - mockAuth       │
│ - prisma         │    │ - auth           │
└──────────────────┘    └──────────────────┘
```

### Prisma Mock Setup

**File: `src/lib/__mocks__/prisma.ts`**
```typescript
import { vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "../../../generated/prisma/client.ts";

// Create the mock instance
export const prismaMock = mockDeep<PrismaClient>();

// Export as 'prisma' to match the real module's export
export const prisma = prismaMock;

// Mock the pool
export const pool = {
    end: vi.fn().mockResolvedValue(undefined),
};

// Mock disconnectDatabase
export const disconnectDatabase = vi.fn().mockResolvedValue(undefined);

export type MockPrismaClient = DeepMockProxy<PrismaClient>;
```

**File: `__tests__/setup/mocks/prisma.ts`**
```typescript
import { vi, beforeEach } from "vitest";
import { mockReset } from "vitest-mock-extended";

// Import the mock module FIRST (synchronously, before vi.mock registration)
import * as prismaMockModule from "../../../src/lib/__mocks__/prisma";

// Re-export for test files
export const prismaMock = prismaMockModule.prismaMock;

// Register mock with SYNCHRONOUS factory
vi.mock("@/lib/prisma", () => prismaMockModule);

// Reset mocks before each test
beforeEach(() => {
    mockReset(prismaMock);
});
```

### Auth Mock Setup

**File: `src/lib/__mocks__/auth.ts`**
```typescript
import { vi } from "vitest";

export const mockAuth = {
    api: {
        getSession: vi.fn(),
    },
    handler: vi.fn(),
};

// Export as 'auth' to match the real module's export
export const auth = mockAuth;
```

**File: `__tests__/setup/mocks/auth.ts`**
```typescript
import { vi } from "vitest";

// Import the mock module FIRST (synchronously, before vi.mock registration)
import * as authMockModule from "../../../src/lib/__mocks__/auth";

// Re-export the mockAuth for test files
export const mockAuth = authMockModule.mockAuth;

// Register mock with SYNCHRONOUS factory
vi.mock("@/lib/auth", () => authMockModule);

// Helper functions
export const setupAuthMock = (session) => {
    mockAuth.api.getSession.mockResolvedValue(session);
};
```

### Why This Pattern Works

✅ **Synchronous Loading**: Mock module is imported before `vi.mock()` executes
✅ **Pre-instantiated Mocks**: Mock objects exist before factory runs
✅ **No Hoisting Issues**: No reference to undefined variables
✅ **Type Safety**: Full TypeScript support
✅ **Reusable**: Same pattern for all mock modules

### Anti-Pattern (Don't Do This)

```typescript
// ❌ WRONG - Mock created after vi.mock hoisting
export const mockAuth = {
    api: { getSession: vi.fn() }
};

vi.mock("@/lib/auth", () => ({
    auth: mockAuth  // ❌ mockAuth is undefined at hoist time!
}));
```

---

## Running Tests

### All Tests

```bash
cd apps/blog-api
bun run test:run
```

Expected output:
```
Test Files  14 passed (14)
     Tests  407 passed (407)
```

### Unit Tests Only

```bash
bun run test:unit
```

### Integration Tests Only

```bash
bun run test:integration
```

### Watch Mode

```bash
bun run test
```

### With Coverage

```bash
bun run test:coverage
```

---

## Writing Tests

### Integration Test Pattern

**Example: Testing a POST endpoint**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { mockReset } from "vitest-mock-extended";
import { prismaMock, mockPost, mockUser } from "../../setup/mocks/prisma";
import { setupAuthorAuth } from "../../setup/mocks/auth";
import postsRoute from "../../../src/routes/posts";

describe("Posts Route", () => {
    let app: Hono;

    beforeEach(() => {
        mockReset(prismaMock);
        app = new Hono();
        app.route("/api/posts", postsRoute);
    });

    describe("POST /api/posts", () => {
        it("should create post when authenticated as author", async () => {
            // Setup authentication
            setupAuthorAuth({ id: "author123" });

            // Setup Prisma mock
            const mockPostData = mockPost({
                title: "Test Post",
                authorId: "author123",
            });
            prismaMock.post.create.mockResolvedValue(mockPostData);

            // Make request
            const res = await app.request("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "Test Post",
                    content: "Test content",
                }),
            });

            // Assert
            expect(res.status).toBe(201);
            const body: any = await res.json();
            expect(body.title).toBe("Test Post");
            expect(prismaMock.post.create).toHaveBeenCalledTimes(1);
        });
    });
});
```

### Unit Test Pattern

**Example: Testing middleware**

```typescript
import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeMarkdown } from "../../../src/utils/sanitize";

describe("Sanitize Utils", () => {
    describe("sanitizeText", () => {
        it("should strip HTML tags", () => {
            const result = sanitizeText("<script>alert('xss')</script>Hello");
            expect(result).toBe("Hello");
        });

        it("should preserve plain text", () => {
            const result = sanitizeText("Plain text");
            expect(result).toBe("Plain text");
        });
    });
});
```

### Mock Setup Helpers

#### Prisma Mocks

```typescript
import { prismaMock, mockPost, mockUser, mockTag } from "../../setup/mocks/prisma";

// Mock database queries
prismaMock.post.findMany.mockResolvedValue([mockPost()]);
prismaMock.user.findUnique.mockResolvedValue(mockUser({ role: "ADMIN" }));
prismaMock.tag.create.mockResolvedValue(mockTag({ name: "TypeScript" }));
```

#### Auth Mocks

```typescript
import {
    setupAuthMock,
    setupReaderAuth,
    setupAuthorAuth,
    setupAdminAuth,
    setupUnauthenticated,
} from "../../setup/mocks/auth";

// Authenticated as author
setupAuthorAuth({ id: "author123", email: "author@test.com" });

// Authenticated as admin
setupAdminAuth();

// Unauthenticated
setupUnauthenticated();
```

#### Storage Mocks

```typescript
import { mockStorage } from "../../setup/mocks/supabase";

// Mock file upload
mockStorage.upload.mockResolvedValue({
    data: { path: "blog-images/test.jpg" },
    error: null,
});
```

---

## Troubleshooting

### Common Issues

#### Issue 1: "Cannot access '__vi_import_X__' before initialization"

**Cause:** Using an imported module (like `mockDeep`) inside `vi.hoisted()` or referencing a variable before it's initialized in `vi.mock()`.

**Solution:** Use the synchronous mock module pattern (see [Mock Setup Architecture](#mock-setup-architecture)).

#### Issue 2: Integration tests get 401 Unauthorized

**Cause:** Auth mock not properly set up or auth module not mocked before routes import it.

**Solution:**
1. Ensure `__tests__/setup/test-utils.ts` imports `./mocks/auth` before any tests run
2. Use `setupAuthorAuth()` or `setupAdminAuth()` in your test's `beforeEach`
3. Verify the auth mock module exists at `src/lib/__mocks__/auth.ts`

#### Issue 3: Prisma mock returns undefined

**Cause:** Mock not registered before route imports prisma, or mock not reset between tests.

**Solution:**
1. Check that `vi.mock("@/lib/prisma")` uses synchronous factory
2. Ensure `mockReset(prismaMock)` is called in `beforeEach`
3. Verify mock methods are set up: `prismaMock.post.findMany.mockResolvedValue(...)`

#### Issue 4: "Module not found" errors

**Cause:** Path aliases not resolved correctly.

**Solution:** Check `vitest.config.ts` includes `tsconfigPaths()` plugin:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    // ...
});
```

#### Issue 5: Tests timeout

**Cause:** Async operations not completing, often due to real database connections.

**Solution:**
1. Verify all modules are mocked (`prisma`, `auth`, `supabase`)
2. Check for missing `mockResolvedValue()` on async mock methods
3. Increase timeout in `vitest.config.ts` if needed:

```typescript
test: {
    testTimeout: 10000  // 10 seconds
}
```

### Debug Tips

#### 1. Check Mock Registration

Add console logs to verify mock execution order:

```typescript
// In __tests__/setup/mocks/prisma.ts
console.log("Prisma mock registered at:", Date.now());

// In test file
console.log("Test starting at:", Date.now());
```

#### 2. Verify Mock Calls

```typescript
// Check if mock was called
expect(prismaMock.post.findMany).toHaveBeenCalled();

// Check call arguments
expect(prismaMock.post.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ title: "Test" })
});
```

#### 3. Inspect Mock Return Values

```typescript
beforeEach(() => {
    prismaMock.post.findMany.mockResolvedValue([mockPost()]);
    console.log("Mock setup:", prismaMock.post.findMany.getMockImplementation());
});
```

---

## Best Practices

### 1. Always Reset Mocks

```typescript
beforeEach(() => {
    mockReset(prismaMock);
    vi.clearAllMocks();
});
```

### 2. Use Mock Factories

Instead of creating objects inline:

```typescript
// ✅ Good
const post = mockPost({ title: "Custom Title" });

// ❌ Avoid
const post = {
    id: "123",
    title: "Custom Title",
    // ... 20 more fields
};
```

### 3. Test One Thing Per Test

```typescript
// ✅ Good
it("should return 201 when post is created", async () => {
    // Single assertion
});

it("should call prisma.post.create", async () => {
    // Single assertion
});

// ❌ Avoid
it("should create post and return 201 and call prisma", async () => {
    // Too many assertions
});
```

### 4. Use Descriptive Test Names

```typescript
// ✅ Good
it("should return 403 when user is not the post author", async () => {});

// ❌ Avoid
it("should fail", async () => {});
```

### 5. Keep Tests Independent

Each test should be able to run in isolation. Don't rely on test execution order.

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev)
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking)
- [vitest-mock-extended](https://github.com/marchaos/vitest-mock-extended)
- [Prisma Testing Guide](https://www.prisma.io/blog/testing-series-1-8eRB5p0Y8o)
- [Better-Auth Documentation](https://better-auth.com/docs)

---

*Last Updated: 2024-01-15*
