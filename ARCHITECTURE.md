# Blog API - Technical Architecture Documentation

> **Comprehensive code-level documentation** explaining how the API routes are implemented and work together.

---

## Table of Contents

1. [Application Architecture & Initialization](#1-application-architecture--initialization)
2. [Route Organization & Registration](#2-route-organization--registration)
3. [Middleware Pipeline](#3-middleware-pipeline)
4. [Database Layer - Prisma Integration](#4-database-layer---prisma-integration)
5. [Authentication Flow - Better-Auth](#5-authentication-flow---better-auth-integration)
6. [Request Lifecycle](#6-request-lifecycle---detailed-flow)
7. [Key Patterns & Conventions](#7-key-patterns-and-conventions)
8. [Special Features & Workflows](#8-special-features-and-workflows)
9. [Environment Configuration](#9-environment-configuration)
10. [Performance & Scalability](#10-performance-and-scalability-considerations)
11. [Security Summary](#11-security-summary)

---

## 1. Application Architecture & Initialization

### Entry Point: `src/index.ts`

The application is built with **Hono** (a lightweight TypeScript web framework) and initializes with a well-orchestrated middleware pipeline.

### Initialization Flow

```
Application Creation → Middleware Setup → Route Registration → Error Handling → Server Export
```

### Key Components

#### 1.1 Hono Application Creation

```typescript
const app = new Hono()
```

Hono provides a minimal but powerful web framework suitable for API development, compatible with Bun, Cloudflare Workers, and other modern runtimes.

#### 1.2 CORS Middleware (MUST be first)

```typescript
app.use("*", cors({
    origin: (origin) => {
        const allowedOrigins = process.env.NODE_ENV === "production"
            ? [process.env.FRONTEND_URL]
            : ["http://localhost:3000", "http://localhost:3001", process.env.FRONTEND_URL];
        return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    maxAge: 600,
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
}));
```

**Features:**
- Dynamic origin validation based on NODE_ENV
- Credentials enabled for cookie-based authentication
- Preflight caching (10 minutes)
- Rate limit headers exposed to client

#### 1.3 Logging Middleware

```typescript
app.use("*", logger())
```

Logs all requests/responses for debugging and monitoring.

#### 1.4 Security Middleware

Applied after CORS to prevent bypass:
- Security headers (prevents clickjacking, MIME sniffing, XSS)
- Request validation (blocks attack patterns)
- Rate limiting (tiered by route)
- Body size limits

#### 1.5 Route Registration

```typescript
app.route("/health", healthRoute);
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/me", meRoute);
app.route("/api/posts", postsRoute);
app.route("/api/publish", publishRoute);
app.route("/api/tags", tagsRoute);
app.route("/api/upload", uploadRoute);
app.route("/api/comments", commentsRoute);
app.route("/api/users", usersRoute);
```

**Pattern:**
- Routes mounted at specific prefixes using `app.route()`
- Better-Auth handles all `/api/auth/*` routes separately
- Each route is a separate Hono sub-application

#### 1.6 Error Handling

```typescript
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    if (isPrismaError(err)) {
        return c.json({ error: "Database error", code: err.code }, 400);
    }

    if (err instanceof ZodError) {
        return c.json({ error: "Validation error", issues: err.issues }, 400);
    }

    // Generic error
    return c.json({
        error: "Internal Server Error",
        ...(process.env.NODE_ENV !== "production" && { message: err.message })
    }, 500);
});
```

**Environment-aware error details:**
- Development: Full error messages
- Production: Minimal error details for security

#### 1.7 Graceful Shutdown

```typescript
const shutdown = async () => {
    console.log("Shutting down gracefully...");
    await disconnectDatabase();
    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

Ensures:
- Database connections closed properly
- Connection pool terminated
- No orphaned connections on deployment

#### 1.8 Server Export

```typescript
export default {
    port: process.env.PORT || 3001,
    fetch: app.fetch,
};
```

This is the Bun/Cloudflare Workers runtime export pattern.

---

## 2. Route Organization & Registration

### Route Structure

```
/health                    - Health check endpoint
/api/auth/*               - Better-Auth authentication (email/password, sessions)
/api/me                   - Current user info retrieval
/api/posts                - Post CRUD operations and listing
/api/publish              - Publishing workflow (request/approve/reject)
/api/tags                 - Tag management
/api/upload               - Image uploads to Supabase Storage
/api/comments             - Comments on posts
/api/users                - User management
```

### Route Registration Pattern

Each route:
1. Created as separate file exporting a Hono sub-application
2. Type-extended with `AuthContext` for type-safe context access
3. Registered using `app.route(prefix, routeInstance)`

**Example:**

```typescript
// src/routes/me.ts
const me = new Hono<AuthContext>();
me.use("*", requireAuth);  // Apply middleware to all routes
me.get("/", async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    return c.json({ user, session });
});
export default me;
```

### Route Categories

#### 2.1 Public Routes

- Health, Posts list, Tags
- No authentication required
- Use `optionalAuth` middleware to include user context if logged in
- Visibility controlled at query level based on post status

#### 2.2 Authenticated Routes

- Me, My Comments, My Publish Requests
- Require `requireAuth` middleware
- User context available via `c.get("user")` and `c.get("session")`

#### 2.3 Admin Routes

- Publish requests, Tag management
- Use `requireAuth` + `requireRole("ADMIN")`
- Composable middleware: `requireRole(...roles)` can require specific roles

#### 2.4 Complex Business Logic Routes

- Posts CRUD, Comments, Publish workflow
- Use transaction management for data consistency
- Implement retry logic for unique constraint errors
- Apply authorization checks at handler level

---

## 3. Middleware Pipeline

### Execution Order (Critical for Security)

```
1. CORS (preflight handling)
2. Logger
3. Security Headers
4. Request Validation (attack pattern detection)
5. Rate Limiting (tiered by route)
6. Body Size Limits
7. Better-Auth Handler (for /api/auth/*)
8. Route-Specific Auth Middleware
9. Route Handler
10. Error Handler
```

### 3.1 Authentication Middleware (`src/middleware/auth.ts`)

#### requireAuth - Mandatory Authentication

```typescript
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (!session?.user || !session?.session) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", session.user);
    c.set("session", session.session);
    await next();
}
```

**Features:**
- Calls `auth.api.getSession()` with request headers
- Extracts session from request cookies or Authorization header
- Sets `user` and `session` on context Variables
- Returns 401 if no valid session

#### AuthContext Type

```typescript
type AuthContext = {
    Variables: {
        user: {
            id: string;
            email: string;
            role: string;
            name: string | null;
            emailVerified: boolean;
        };
        session: {
            id: string;
            expiresAt: Date;
            token: string;
            userId: string;
        };
    };
};
```

#### requireRole - Authorization Based on Roles

```typescript
export function requireRole(...allowedRoles: string[]) {
    return async (c: Context, next: Next) => {
        const user = c.get("user");
        if (!allowedRoles.includes(user.role)) {
            return c.json({ error: "Forbidden" }, 403);
        }
        await next();
    }
}
```

**Usage:**
```typescript
posts.post("/", requireAuth, requireRole("AUTHOR", "ADMIN"), async (c) => {
    // Role already validated
});
```

#### optionalAuth - Conditional Authentication

```typescript
export async function optionalAuth(c: Context, next: Next): Promise<void> {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (session?.user && session?.session) {
        c.set("user", session.user);
        c.set("session", session.session);
    }

    await next();
}
```

- Attempts to retrieve session but doesn't fail
- Silently continues if no session found
- Allows public content with authenticated features

### 3.2 Security Middleware (`src/middleware/security.ts`)

#### securityHeaders Middleware

Applied after all handlers complete:

```
X-Frame-Options: DENY              // Prevent clickjacking
X-Content-Type-Options: nosniff    // Prevent MIME sniffing
X-XSS-Protection: 1; mode=block    // Enable XSS filter
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store...         // For sensitive endpoints
CSP: default-src 'none'            // Restrictive CSP
HSTS: max-age=31536000             // HTTPS enforcement (production only)
```

#### requestValidation Middleware

Blocks common attack paths:

```typescript
const blockedSegments = [
    "wp-admin", "wp-login", "xmlrpc.php", "phpmyadmin",
    ".env", ".git", "config.php", "admin.php", ".htaccess"
];
```

Validates query parameters against:

```typescript
const suspiciousParams = ["<script", "javascript:", "data:text/html", "onerror=", "onload="];
```

Validates Content-Type for POST/PUT/PATCH (must be JSON or multipart for uploads).

#### bodySizeLimit Factory

```typescript
export function bodySizeLimit(maxSizeBytes: number)
```

Pre-configured limits:
- `jsonBodyLimit`: 1MB for API requests
- `uploadBodyLimit`: 10MB for file uploads
- Returns 413 Payload Too Large if exceeded

### 3.3 Rate Limiting Middleware (`src/middleware/rate-limit.ts`)

#### Implementation

Uses in-memory store with periodic cleanup:

```typescript
const rateLimitStore = new Map<string, RateLimitEntry>();
// Cleanup runs every 60 seconds
```

#### Rate Limiter Factory

```typescript
export function rateLimiter(options: RateLimitOptions)
```

Options:
- `limit`: Max requests in window
- `windowMs`: Time window in milliseconds
- `keyGenerator`: Function to generate rate limit key (default: IP address)
- `skip`: Function to skip certain requests

#### IP Detection

```
1. If TRUST_PROXY=true:
   - Check x-forwarded-for header (first IP)
   - Check x-real-ip header
   - Check cf-connecting-ip header (Cloudflare)
2. If no proxy headers:
   - Generate fingerprint from user-agent + accept-language
   - Hash to create unique identifier
```

#### Pre-configured Rate Limiters

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| generalRateLimit | 100 | 1 minute | /api/* |
| authRateLimit | 30 (prod) / 50 (dev) | 5 min / 1 min | /api/auth/* |
| uploadRateLimit | 20 | 1 hour | /api/upload |
| strictRateLimit | 5 | 1 minute | Sensitive ops |

#### Rate Limit Headers

```
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: <count>
X-RateLimit-Reset: <seconds>
Retry-After: <seconds>  (when exceeded)
```

---

## 4. Database Layer - Prisma Integration

### 4.1 Prisma Configuration (`src/lib/prisma.ts`)

#### Connection Setup

Uses PostgreSQL with Prisma's native adapter:

```typescript
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,                      // Max 10 connections
    min: 2,                       // Maintain 2 minimum
    idleTimeoutMillis: 30000,    // Close idle after 30s
    connectionTimeoutMillis: 10000
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

#### Singleton Pattern

Prevents multiple PrismaClient instances:

```typescript
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = prisma;
}
```

#### Graceful Shutdown

```typescript
export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    await pool.end();
}
```

### 4.2 Data Model

#### Core Tables

**User** (Better-Auth)
- Stores user authentication and profile
- Fields: id, email, emailVerified, name, image, role, timestamps
- Indexes: email (unique), role
- Role enum: ADMIN, AUTHOR, READER

**Session** (Better-Auth)
- Stores active sessions
- Fields: id, token, expiresAt, ipAddress, userAgent, userId
- Cascade delete on user deletion

**Post**
- Core blogging entity
- Fields: title, slug (unique), content, excerpt, coverImage, status, viewCount, isFeatured, publishedAt, authorId
- Indexes: slug, authorId, status, publishedAt, isFeatured, createdAt
- Status enum: DRAFT, PENDING_APPROVAL, PUBLISHED, ARCHIVED
- Relation: authorId → User (cascade delete)

**Tag**
- Categorization system
- Fields: id, name (unique), slug (unique)
- Many-to-many with Post via PostTag

**PostTag** (Junction Table)
- Composite primary key: [postId, tagId]
- Cascade delete on post or tag deletion

**Comment**
- Threaded discussion on posts
- Fields: content, postId, authorId, timestamps
- Indexes: postId, authorId, createdAt

**PublishRequest**
- Workflow for publication approval
- Fields: postId, authorId, status, message
- Status enum: PENDING, APPROVED, REJECTED
- Unique constraint: (postId, status) - only one pending request per post

### 4.3 Query Patterns

#### Parallel Queries

```typescript
const [posts, total] = await Promise.all([
    prisma.post.findMany({...}),
    prisma.post.count({...})
]);
```

- Executes in parallel for efficiency
- Used for paginated results

#### Transactions

```typescript
await prisma.$transaction(async (tx) => {
    const tag = await tx.tag.create({...});
    const post = await tx.post.create({...});
    return post;
});
```

- Used for tag management and publish workflow
- Ensures data consistency across multiple operations

#### Selecting Specific Fields

```typescript
author: {
    select: {
        id: true,
        name: true,
        email: true
    }
}
```

- Reduces response payload
- Includes count operations: `_count: { select: { comments: true } }`

#### Conditional Filtering

```typescript
const where: any = {};
if (authorId) where.authorId = authorId;
if (tagSlug) where.tags = { some: { tag: { slug: tagSlug } } };
if (search) {
    where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } }
    ];
}
```

- Builds dynamic WHERE clauses
- Case-insensitive searches

---

## 5. Authentication Flow - Better-Auth Integration

### 5.1 Better-Auth Setup (`src/lib/auth.ts`)

#### Configuration

```typescript
export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: [...],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7,  // 7 days
        updateAge: 60 * 60 * 24,       // Update if older than 1 day
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60              // Cache for 5 minutes
        }
    },
    advanced: {
        crossSubDomainCookies: { enabled: isProduction },
        defaultCookieAttributes: {
            secure: isProduction,
            httpOnly: true,
            sameSite: isProduction ? "none" : "lax"
        }
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "READER",
                input: false
            }
        }
    }
});
```

### 5.2 Authentication Endpoints

All `/api/auth/*` routes handled by Better-Auth:

**Key Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/sign-up` | POST | Email/password registration |
| `/api/auth/sign-in` | POST | Email/password authentication |
| `/api/auth/sign-out` | POST | Invalidates session |
| `/api/auth/session` | GET | Returns current user and session |
| `/api/auth/refresh` | POST | Refreshes session before expiry |

### 5.3 Session Lifecycle

#### Session Creation

1. User signs in with email/password
2. Better-Auth validates credentials
3. Creates Session record in database
4. Returns session token in HTTP-only cookie
5. Sets `expires_at` to now + 7 days

#### Session Validation on Each Request

```typescript
const session = await auth.api.getSession({
    headers: c.req.raw.headers
});
```

#### Session Update

- If session age > 1 day, automatically renewed
- Extends expiry by another 7 days
- Cookie cache prevents excessive updates (5 minute window)

#### Session Expiry

- Automatic: After 7 days of inactivity
- Manual: On sign-out
- Cascade deleted: When user is deleted

---

## 6. Request Lifecycle - Detailed Flow

```
HTTP Request
    ↓
[1] CORS Middleware - Check origin validity
    ↓
[2] Logger Middleware - Log request
    ↓
[3] Security Headers Middleware - Add headers after response
    ↓
[4] Request Validation - Block attack patterns
    ↓
[5] Rate Limiting - Check request limits by IP
    ↓
[6] Body Size Limit - Validate Content-Length
    ↓
[7] Route Matching - Match to registered route
    ├─ /api/auth/* → Better-Auth Handler
    │   ↓
    │   [Authentication Logic]
    │   ↓
    │   Response (session cookie, user data, or error)
    │
    └─ Other Routes
        ↓
        [8] Apply Route-Specific Middleware
        ├─ optionalAuth: Attempt to get session (non-blocking)
        ├─ requireAuth: Must have valid session (401 if not)
        └─ requireRole(...): Must have allowed role (403 if not)
        ↓
        [9] Extract Validated Data
        ├─ validateBody(schema) - Parse and validate request body
        ├─ validateQuery(schema) - Parse and validate query params
        └─ validateParams(schema) - Parse and validate path params
        ↓
        [10] Sanitization (if needed)
        ├─ sanitizeText() - HTML entities escape
        ├─ sanitizeMarkdown() - Remove dangerous HTML
        └─ sanitizeFileName() - Safe file names
        ↓
        [11] Authorization Check (if needed)
        ├─ Check ownership (user.id === resource.authorId)
        ├─ Check admin role (user.role === "ADMIN")
        └─ Return 403 Forbidden if failed
        ↓
        [12] Database Operation
        ├─ Single query (SELECT, INSERT, UPDATE, DELETE)
        ├─ Parallel queries (Promise.all)
        └─ Transaction (all-or-nothing)
        ↓
        [13] Build Response
        ├─ Transform data (map, select fields)
        ├─ Include related data (includes, selects)
        └─ Format for client consumption
        ↓
        [14] Return Response
        ├─ c.json(data, statusCode)
        └─ HTTP Status + JSON body
        ↓
[15] Error Handler (if error thrown)
├─ HTTPException → Extract status and message
├─ PrismaClientKnownRequestError → 400 with error code
├─ ZodError → 400 with validation issues
└─ Generic Error → 500 with environment-aware details
    ↓
[16] Security Headers Applied
├─ Add X-Frame-Options, CSP, etc.
├─ Add Cache-Control for sensitive routes
└─ Add HSTS in production
    ↓
[17] Rate Limit Headers Applied
├─ X-RateLimit-Limit
├─ X-RateLimit-Remaining
└─ X-RateLimit-Reset
    ↓
HTTP Response Sent to Client
```

---

## 7. Key Patterns and Conventions

### 7.1 Error Handling Pattern

#### Three-Level Error Handling

1. **Validation Level**: Zod schemas catch type errors
2. **Database Level**: Prisma catches constraint violations
3. **Application Level**: HTTP responses wrap errors

#### Error Response Format

```typescript
// Validation error
{ error: "Validation Error", issues: [...] }

// Database error
{ error: "Database operation failed", code: "P2002" }

// Authorization error
{ error: "Forbidden", message: "..." }

// Generic error
{ error: "Internal Server Error", message: "..." }  // only in dev
```

### 7.2 Authorization Pattern

#### Ownership Check

```typescript
const isOwner = post.authorId === user.id;
const isAdmin = user.role === "ADMIN";

if (!isOwner && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
}
```

#### Role Check

```typescript
// Via middleware
posts.post("/", requireAuth, requireRole("AUTHOR", "ADMIN"), async (c) => {
    // Role already validated
});
```

### 7.3 Pagination Pattern

```typescript
const page = query.page;
const limit = query.limit;
const skip = (page - 1) * limit;

const [data, total] = await Promise.all([
    prisma.post.findMany({ skip, take: limit }),
    prisma.post.count({ where })
]);

return c.json({
    posts: data,
    pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
    }
});
```

### 7.4 Dynamic Query Building Pattern

```typescript
const where: any = {};

// Apply visibility rules
if (!user) {
    where.status = "PUBLISHED";
} else if (isAdmin) {
    if (status) where.status = status;
} else {
    where.OR = [
        { status: "PUBLISHED" },
        { authorId: user.id }
    ];
}

// Add filters
if (authorId) where.authorId = authorId;
if (tagSlug) where.tags = { some: { tag: { slug: tagSlug } } };

// Execute with single query
const posts = await prisma.post.findMany({ where, skip, take });
```

### 7.5 Slug Generation and Uniqueness

#### Challenge

Ensure unique URLs for posts and tags.

#### Solution

Retry with counter:

```typescript
async function generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const existing = await prisma.post.findUnique({ where: { slug } });
        if (!existing) return slug;
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
}
```

#### Transaction Support

```typescript
async function withSlugRetry<T>(
    slugFactory: () => Promise<string>,
    action: (slug: string) => Promise<T>
): Promise<T> {
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
        const slug = await slugFactory();
        try {
            return await action(slug);
        } catch (error) {
            if (isUniqueConstraintError(error, ["slug"])) {
                continue;
            }
            throw error;
        }
    }
}
```

**Why Two Layers?**
- `generateUniqueSlug`: Find available slug
- `withSlugRetry`: Handle race conditions in transactions

### 7.6 Content Sanitization Strategy

#### Three-Level Approach

1. **Input Validation (Zod)**
   - Type checking
   - Length limits
   - Pattern matching

2. **Content Sanitization**
   - `sanitizeText()`: Strip HTML for titles/names
   - `sanitizeMarkdown()`: Remove dangerous HTML for content
   - `escapeHtml()`: Escape for comments

3. **Database Constraints**
   - Parameterized queries prevent SQL injection
   - Unique constraints prevent duplicates

### 7.7 Image Upload Flow with Security

#### Multi-Layer Security

1. **MIME Type Validation**
   ```typescript
   const ALLOWED_IMAGE_TYPES = [
       "image/jpeg", "image/png", "image/webp", "image/gif"
   ];
   ```

2. **File Size Limit**
   ```typescript
   const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
   ```

3. **Binary Signature Verification**
   ```typescript
   // Verify file actually matches declared MIME type
   if (!matchesSignature(file.type, uint8Array)) {
       return error(400);
   }
   ```

4. **Ownership Verification**
   ```typescript
   const isOwner = filePath.startsWith(`blog-images/${user.id}/`);
   ```

5. **Safe Path Validation**
   ```typescript
   // Only allows: /^[a-zA-Z0-9/_\-.]+$/
   // Must start with: blog-images/
   ```

#### Upload Path Structure

```
blog-images/{userId}/{timestamp}-{basename}-{random}.{ext}
Example: blog-images/user123/1704067200000-my-image-abc123.jpg
```

---

## 8. Special Features and Workflows

### 8.1 Publishing Approval Workflow

#### States

- **DRAFT** → Author writes and edits
- **PENDING_APPROVAL** → Author requests publishing
- **PUBLISHED** → Admin approved
- **Back to DRAFT** → Admin rejected

#### Workflow Endpoints

**Request Publishing** (Author)
- POST `/api/publish/posts/:postId/request`
- Only DRAFT posts
- Creates PublishRequest with PENDING status
- Updates post to PENDING_APPROVAL

**Admin Approval**
- POST `/api/publish/requests/:requestId/approve`
- Atomically: Update request → APPROVED, Post → PUBLISHED, set publishedAt

**Admin Rejection**
- POST `/api/publish/requests/:requestId/reject`
- Atomically: Update request → REJECTED, Post → DRAFT

**Cancel Request** (Author)
- DELETE `/api/publish/requests/:requestId`
- Atomically: Delete request, Post → DRAFT

### 8.2 Comments System

**Constraints:**
- Can only comment on PUBLISHED posts
- Comments visible to anyone on published posts
- Authors can view comments on their draft posts
- Admins see all comments

**Ownership:**
- Users can edit/delete their own comments
- Admins can delete any comment

### 8.3 Tag Management

**Features:**
- Create, update, delete tags (admin only)
- Auto-slug generation
- Case-insensitive duplicate prevention
- Cannot delete tags with associated posts
- Post-count included in responses

---

## 9. Environment Configuration

### Key Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db

# Better-Auth
BETTER_AUTH_SECRET=<random secret>
BETTER_AUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000

# File Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<anon key>

# Deployment
NODE_ENV=production
PORT=3001
TRUST_PROXY=true
```

### Environment-Specific Behavior

**Development:**
- CORS allows localhost:3000, localhost:3001
- HTTPS not required
- Detailed error messages
- Auth rate limit: 50 per minute

**Production:**
- CORS only allows FRONTEND_URL
- HTTPS required (HSTS header)
- Minimal error details
- Auth rate limit: 30 per 5 minutes

---

## 10. Performance and Scalability Considerations

### Optimizations

**Connection Pooling**
- Min 2, max 10 connections to database
- Idle timeout: 30 seconds
- Reuses connections across requests

**Query Optimization**
- Parallel queries with Promise.all
- Selective field selection
- Indexed queries on common filters

**Session Caching**
- Cookie cache: 5 minute window
- Session expiry: 7 days
- Automatic refresh: If older than 1 day

**Rate Limiting**
- In-memory store (fast lookups)
- Periodic cleanup prevents memory leaks
- Different limits per endpoint

### Limitations (for future improvement)

- Rate limiter is single-process (not distributed)
- For multi-server deployment, use Redis-based rate limiting
- No query result caching
- In-memory rate limit store lost on restart

---

## 11. Security Summary

### Layers of Security

**Network Layer**
- CORS with origin validation
- HTTPS enforcement (production)
- HSTS header

**Application Layer**
- Input validation (Zod)
- Rate limiting
- Session validation
- Authorization checks

**Data Layer**
- Parameterized queries (Prisma)
- Ownership verification
- Role-based access control
- Cascade deletes

**Content Layer**
- HTML sanitization
- XSS prevention
- File type/signature validation
- Path traversal prevention

**Response Layer**
- Security headers (CSP, X-Frame-Options, etc.)
- Cache control for sensitive data
- Error message obfuscation (production)

---

## Conclusion

This architecture emphasizes:
- **Security**: Multiple layers of protection
- **Data Consistency**: Transactions and constraints
- **Separation of Concerns**: Clear middleware and route organization
- **Type Safety**: TypeScript and Zod validation
- **Performance**: Connection pooling and query optimization
- **Maintainability**: Clean patterns and conventions

For questions or improvements, refer to the codebase or contact the development team.
