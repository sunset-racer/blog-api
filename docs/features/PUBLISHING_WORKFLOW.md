# Publishing Approval Workflow

> **Comprehensive feature documentation** for the blog-api Publishing Approval Workflow system.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [User Roles and Permissions](#2-user-roles-and-permissions)
3. [State Flow Diagram](#3-state-flow-diagram)
4. [API Endpoints Reference](#4-api-endpoints-reference)
5. [Business Rules and Constraints](#5-business-rules-and-constraints)
6. [Database Schema](#6-database-schema)
7. [Error Scenarios](#7-error-scenarios-and-handling)
8. [Transaction Guarantees](#8-transaction-usage-and-atomicity-guarantees)
9. [Security Considerations](#9-security-considerations)
10. [Usage Examples](#10-api-usage-examples)

---

## 1. Feature Overview

### Purpose

The **Publishing Approval Workflow** is a content moderation system that implements a structured approval process for blog posts. It enforces a multi-step workflow where authors can request to publish their draft posts, and administrators must review and either approve or reject these requests before publication.

### Key Benefits

- ✅ **Quality Control**: Ensures all published content meets editorial standards
- ✅ **Editorial Oversight**: Maintains control over what goes live
- ✅ **Audit Trail**: Tracks approval history and rejection reasons
- ✅ **Clear Communication**: Provides feedback mechanism between authors and admins
- ✅ **Prevents Premature Publication**: No direct publication without approval

### Key Features

- Request publishing for draft posts
- Admin approval/rejection workflow
- Optional messages for feedback
- View all requests (admin) or own requests (author)
- Cancel pending requests
- Atomic state transitions
- Complete audit trail

---

## 2. User Roles and Permissions

### Role Matrix

| Role | Can Request Publish | Can Approve/Reject | Can View All Requests | Can View Own Requests | Can Cancel Request |
|------|-------------------|--------------------|----------------------|----------------------|-------------------|
| **AUTHOR** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ✅ Yes (own only) |
| **ADMIN** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (any) |
| **READER** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

### Detailed Permissions

#### Authors (AUTHOR role)

**Can:**
- Request to publish their own draft posts
- View their own publish requests
- Cancel their pending requests

**Cannot:**
- Request publish for other authors' posts
- Approve or reject any requests
- View other authors' requests

#### Admins (ADMIN role)

**Can:**
- Request to publish any post
- Approve pending publish requests
- Reject pending publish requests with reasons
- View all publish requests (with filtering)
- Cancel any pending requests

**Has full control over:** All aspects of the publishing workflow

#### Readers (READER role)

**Cannot:**
- Access any part of the publishing workflow
- Create, view, or manage publish requests

---

## 3. State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    POST PUBLISHING WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────┘

Post Status              PublishRequest Status           Actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DRAFT (initial state)
    │
    │  POST /publish/posts/:postId/request
    ├──────────────────────────────────────┐
    │                                       ▼
    │                              Creates PublishRequest
    │                                   (PENDING)
    │                                       │
    ▼                                       ▼
PENDING_APPROVAL ◄────────────────────────────────────┐
    │                                                  │
    │                                                  │
    ├─► POST /publish/requests/:id/approve            │
    │   (Admin only)                                  │
    │   ├─► PublishRequest → APPROVED                 │
    │   └─► Post → PUBLISHED                          │
    │        + Sets publishedAt timestamp             │
    │                                                  │
    ├─► POST /publish/requests/:id/reject             │
    │   (Admin only)                                  │
    │   ├─► PublishRequest → REJECTED                 │
    │   └─► Post → DRAFT ─────────────────────────────┘
    │        + Includes rejection reason
    │
    └─► DELETE /publish/requests/:id
        (Author/Admin)
        ├─► Deletes PublishRequest
        └─► Post → DRAFT ────────────────────────────┘

PUBLISHED (final state)
    │
    └─► ⚠️ Cannot request publish again
        (Only DRAFT posts can request)

ARCHIVED (inactive state)
    │
    └─► ⚠️ Cannot request publish
```

### State Transition Summary

| From State | To State | Trigger | Who Can Trigger | Conditions |
|-----------|----------|---------|-----------------|------------|
| DRAFT | PENDING_APPROVAL | Request Publish | Author/Admin | Post is DRAFT, no pending request exists |
| PENDING_APPROVAL | PUBLISHED | Approve | Admin only | Request is PENDING |
| PENDING_APPROVAL | DRAFT | Reject | Admin only | Request is PENDING |
| PENDING_APPROVAL | DRAFT | Cancel | Author/Admin | Request is PENDING |

---

## 4. API Endpoints Reference

### 4.1 Request Publishing

**Endpoint:** `POST /api/publish/posts/:postId/request`

**Description:** Author requests to publish their draft post. Creates a new publish request and updates post status to PENDING_APPROVAL.

**Authentication:** Required (AUTHOR or ADMIN)

**Path Parameters:**
- `postId` (string, required): CUID of the post to publish

**Request Body:**
```json
{
  "message": "Optional message to admin (max 1000 chars)"
}
```

**Success Response:** `201 Created`
```json
{
  "id": "clreq1234567890123456789",
  "postId": "clpost123456789012345678",
  "authorId": "clauthor12345678901234567",
  "status": "PENDING",
  "message": "Please review my post",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "post": {
    "id": "clpost123456789012345678",
    "title": "My Blog Post",
    "slug": "my-blog-post"
  },
  "author": {
    "id": "clauthor12345678901234567",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Not the post author (unless admin) |
| 404 | Post not found | Post ID doesn't exist |
| 400 | Only draft posts can request publishing | Post status is not DRAFT |
| 400 | A publish request is already pending for this post | Pending request exists |

---

### 4.2 Get All Publish Requests (Admin)

**Endpoint:** `GET /api/publish/requests`

**Description:** Retrieve all publish requests with optional filtering. Admin-only endpoint for managing the approval queue.

**Authentication:** Required (ADMIN only)

**Query Parameters:**
- `status` (string, optional): Filter by status - `PENDING` | `APPROVED` | `REJECTED`
- `authorId` (string, optional): Filter by author CUID

**Success Response:** `200 OK`
```json
{
  "requests": [
    {
      "id": "clreq1234567890123456789",
      "postId": "clpost123456789012345678",
      "authorId": "clauthor12345678901234567",
      "status": "PENDING",
      "message": "Please review my post",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "post": {
        "id": "clpost123456789012345678",
        "title": "My Blog Post",
        "slug": "my-blog-post",
        "excerpt": "Post excerpt...",
        "coverImage": "https://example.com/image.jpg",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:00:00.000Z"
      },
      "author": {
        "id": "clauthor12345678901234567",
        "name": "John Doe",
        "email": "john@example.com",
        "image": "https://example.com/avatar.jpg"
      }
    }
  ]
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | User is not admin |

---

### 4.3 Get User's Own Requests

**Endpoint:** `GET /api/publish/my-requests`

**Description:** Retrieve the current user's publish requests. Authors can track their request status.

**Authentication:** Required (any authenticated user)

**Success Response:** `200 OK`
```json
{
  "requests": [
    {
      "id": "clreq1234567890123456789",
      "postId": "clpost123456789012345678",
      "authorId": "clauthor12345678901234567",
      "status": "PENDING",
      "message": "Please review my post",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "post": {
        "id": "clpost123456789012345678",
        "title": "My Blog Post",
        "slug": "my-blog-post",
        "status": "PENDING_APPROVAL"
      }
    }
  ]
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |

---

### 4.4 Approve Publish Request

**Endpoint:** `POST /api/publish/requests/:requestId/approve`

**Description:** Admin approves a pending publish request. The post becomes PUBLISHED and a timestamp is set.

**Authentication:** Required (ADMIN only)

**Path Parameters:**
- `requestId` (string, required): CUID of the publish request

**Request Body:**
```json
{
  "message": "Optional approval message (max 1000 chars)"
}
```

**Success Response:** `200 OK`
```json
{
  "id": "clreq1234567890123456789",
  "postId": "clpost123456789012345678",
  "authorId": "clauthor12345678901234567",
  "status": "APPROVED",
  "message": "Looks great! Published!",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z",
  "post": {
    "id": "clpost123456789012345678",
    "title": "My Blog Post",
    "slug": "my-blog-post"
  },
  "author": {
    "id": "clauthor12345678901234567",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | User is not admin |
| 404 | Publish request not found | Request ID doesn't exist |
| 400 | This request has already been processed | Request status is not PENDING |

---

### 4.5 Reject Publish Request

**Endpoint:** `POST /api/publish/requests/:requestId/reject`

**Description:** Admin rejects a pending publish request with a reason. The post returns to DRAFT status.

**Authentication:** Required (ADMIN only)

**Path Parameters:**
- `requestId` (string, required): CUID of the publish request

**Request Body:**
```json
{
  "message": "Rejection reason (required, max 1000 chars)"
}
```

**Success Response:** `200 OK`
```json
{
  "id": "clreq1234567890123456789",
  "postId": "clpost123456789012345678",
  "authorId": "clauthor12345678901234567",
  "status": "REJECTED",
  "message": "Content needs more detail and better citations",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z",
  "post": {
    "id": "clpost123456789012345678",
    "title": "My Blog Post",
    "slug": "my-blog-post"
  },
  "author": {
    "id": "clauthor12345678901234567",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | User is not admin |
| 404 | Publish request not found | Request ID doesn't exist |
| 400 | This request has already been processed | Request status is not PENDING |
| 400 | Rejection reason is required | Message field empty or missing |

---

### 4.6 Cancel Publish Request

**Endpoint:** `DELETE /api/publish/requests/:requestId`

**Description:** Author or admin cancels a pending publish request. The post returns to DRAFT status.

**Authentication:** Required (Author of request or ADMIN)

**Path Parameters:**
- `requestId` (string, required): CUID of the publish request

**Success Response:** `200 OK`
```json
{
  "message": "Publish request cancelled successfully"
}
```

**Error Responses:**

| Status Code | Error Message | When |
|------------|---------------|------|
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Not the request author (and not admin) |
| 404 | Publish request not found | Request ID doesn't exist |
| 400 | Only pending requests can be cancelled | Request status is not PENDING |

---

## 5. Business Rules and Constraints

### Core Business Rules

#### 1. Draft Publication Requirement
- ✅ Only DRAFT posts can request publishing
- ❌ PENDING_APPROVAL posts cannot request again
- ❌ PUBLISHED posts cannot request again
- ✅ Rejected posts return to DRAFT for editing

#### 2. Single Pending Request per Post
- ✅ Only one PENDING request can exist per post at a time
- ❌ Attempting to create another returns 400 error
- ✅ Enforced by database unique constraint: `@@unique([postId, status])`

#### 3. Post Status Synchronization
- ✅ PublishRequest.status and Post.status stay synchronized
- ✅ All transitions are atomic via Prisma transactions
- ✅ Prevents orphaned states

#### 4. Ownership and Authorization
- ✅ Authors can only manage their own posts (unless admin)
- ✅ Admins have full access to all posts and requests
- ✅ Request cancellation requires ownership or admin role

#### 5. Approval Workflow
- ✅ Approval is the only path to PUBLISHED status
- ❌ Direct publication via API is not allowed
- ✅ Admins must explicitly approve each request

### Validation Rules

| Field | Constraint | Applied To |
|-------|-----------|-----------|
| message (request) | Max 1000 characters, optional | POST /posts/:postId/request |
| message (approval) | Max 1000 characters, optional | POST /requests/:id/approve |
| message (rejection) | Max 1000 characters, **required** | POST /requests/:id/reject |
| postId | CUID format | All endpoints |
| requestId | CUID format | All request endpoints |
| status (query) | Enum: PENDING, APPROVED, REJECTED | GET /requests |

---

## 6. Database Schema

### PublishRequest Model

```prisma
model PublishRequest {
  id        String               @id @default(cuid())
  postId    String               @map("post_id")
  authorId  String               @map("author_id")
  status    PublishRequestStatus @default(PENDING)
  message   String?              @db.Text
  createdAt DateTime             @default(now()) @map("created_at")
  updatedAt DateTime             @updatedAt @map("updated_at")

  // Relations
  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  // Constraints and indexes
  @@map("publish_requests")
  @@unique([postId, status])
  @@index([postId])
  @@index([authorId])
  @@index([status])
  @@index([createdAt])
}
```

### Related Post Fields

```prisma
model Post {
  // ... other fields
  status          PostStatus         @default(DRAFT)
  publishedAt     DateTime?          @map("published_at")
  publishRequests PublishRequest[]
}
```

### Enums

```prisma
enum PostStatus {
  DRAFT             // Initial state - editable
  PENDING_APPROVAL  // After request - awaiting admin
  PUBLISHED         // After approval - public
  ARCHIVED          // Archived - inactive
}

enum PublishRequestStatus {
  PENDING   // Awaiting admin decision
  APPROVED  // Admin approved
  REJECTED  // Admin rejected with reason
}
```

### Database Constraints

| Constraint Type | Definition | Purpose |
|----------------|------------|---------|
| Primary Key | `id` (CUID) | Unique identifier |
| Foreign Key | `postId` → Post.id | Links to post |
| Foreign Key | `authorId` → User.id | Links to author |
| Unique Composite | `[postId, status]` | Only one PENDING per post |
| Cascade Delete | Post/User deletion | Auto-removes requests |
| Index | `postId`, `authorId`, `status`, `createdAt` | Query performance |

---

## 7. Error Scenarios and Handling

### Error Response Format

All errors return consistent JSON structure:

```json
{
  "error": "Error type",
  "message": "Optional detailed message"
}
```

### Complete Error Matrix

#### Authentication Errors (401)

| Endpoint | Trigger | Response |
|----------|---------|----------|
| All protected | No session token | `401 Unauthorized` |
| All protected | Invalid/expired token | `401 Unauthorized` |

#### Authorization Errors (403)

| Endpoint | Trigger | Response |
|----------|---------|----------|
| POST /posts/:id/request | Not post author (non-admin) | `403 Forbidden` |
| GET /requests | Non-admin user | `403 Forbidden` |
| POST /requests/:id/approve | Non-admin user | `403 Forbidden` |
| POST /requests/:id/reject | Non-admin user | `403 Forbidden` |
| DELETE /requests/:id | Not request author (non-admin) | `403 Forbidden` |

#### Resource Not Found (404)

| Endpoint | Trigger |
|----------|---------|
| POST /posts/:id/request | Post doesn't exist |
| Any /requests/:id endpoint | Publish request doesn't exist |

#### Business Logic Errors (400)

| Error Message | Endpoint | Condition |
|--------------|----------|-----------|
| "Only draft posts can request publishing" | POST /posts/:id/request | Post status ≠ DRAFT |
| "A publish request is already pending for this post" | POST /posts/:id/request | PENDING request exists |
| "This request has already been processed" | POST /approve or /reject | Request status ≠ PENDING |
| "Only pending requests can be cancelled" | DELETE /requests/:id | Request status ≠ PENDING |
| "Rejection reason is required" | POST /requests/:id/reject | Empty message field |

### Edge Cases Handled

#### Race Condition: Duplicate Requests
- **Problem:** Two simultaneous requests for same post
- **Solution:** Database unique constraint `[postId, status]`
- **Result:** First succeeds, second gets 400 error

#### State Consistency
- **Problem:** Request and Post status mismatch
- **Solution:** All updates in Prisma transactions
- **Result:** Atomic updates, no partial states

#### Cascading Deletes
- **Problem:** Deleted post with pending requests
- **Solution:** `onDelete: Cascade` in schema
- **Result:** Requests auto-deleted

#### Double Processing
- **Problem:** Multiple concurrent approvals
- **Solution:** Check `status === PENDING` before update
- **Result:** Only first succeeds

---

## 8. Transaction Usage and Atomicity Guarantees

### Transaction Pattern

All state-changing operations use Prisma's `$transaction` for atomicity:

```typescript
await prisma.$transaction(async (tx) => {
  // Multiple operations - all succeed or all fail
  await tx.publishRequest.create(...);
  await tx.post.update(...);
});
```

### Transactions by Endpoint

#### 1. Create Request
```typescript
await prisma.$transaction(async (tx) => {
  const request = await tx.publishRequest.create({
    data: { postId, authorId, status: "PENDING", message }
  });

  await tx.post.update({
    where: { id: postId },
    data: { status: "PENDING_APPROVAL" }
  });

  return request;
});
```

**Guarantee:** Request creation and post status update are atomic.

#### 2. Approve Request
```typescript
await prisma.$transaction(async (tx) => {
  const request = await tx.publishRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", message }
  });

  await tx.post.update({
    where: { id: postId },
    data: { status: "PUBLISHED", publishedAt: new Date() }
  });

  return request;
});
```

**Guarantee:** Request approval and post publication are atomic.

#### 3. Reject Request
```typescript
await prisma.$transaction(async (tx) => {
  const request = await tx.publishRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", message }
  });

  await tx.post.update({
    where: { id: postId },
    data: { status: "DRAFT" }
  });

  return request;
});
```

**Guarantee:** Request rejection and post reversion are atomic.

#### 4. Cancel Request
```typescript
await prisma.$transaction(async (tx) => {
  await tx.publishRequest.delete({
    where: { id: requestId }
  });

  await tx.post.update({
    where: { id: postId },
    data: { status: "DRAFT" }
  });
});
```

**Guarantee:** Request deletion and post reversion are atomic.

### Atomicity Benefits

✅ **All-or-Nothing**: Operations succeed completely or fail completely
✅ **No Partial Updates**: Database always in consistent state
✅ **Isolation**: READ COMMITTED prevents dirty reads
✅ **Automatic Rollback**: Any failure rolls back entire transaction

---

## 9. Security Considerations

### Authentication Security

#### Session-Based Authentication
- ✅ Uses better-auth library
- ✅ HTTP-only cookies prevent XSS
- ✅ Token validation on every request
- ✅ Session expiration handling

### Authorization Security

#### Role-Based Access Control (RBAC)
- ✅ Three-tier role system (ADMIN, AUTHOR, READER)
- ✅ Endpoint-level enforcement
- ✅ Middleware validation before handler

#### Ownership Verification
```typescript
// Authors can only manage their own posts
if (post.authorId !== user.id && user.role !== "ADMIN") {
  return c.json({ error: "Forbidden" }, 403);
}
```

### Input Validation Security

#### Message Validation
- ✅ Max 1000 characters prevents abuse
- ✅ Zod schema validation
- ✅ Database Text field (no injection risk)

#### Parameter Validation
- ✅ CUID format validation
- ✅ Enum validation for status
- ✅ Type-safe query construction

### State Machine Security

#### Invalid Transition Prevention
- ✅ Only DRAFT posts can request
- ✅ Only PENDING requests can be approved/rejected
- ✅ Status checks before operations

#### Idempotency Protection
```typescript
if (request.status !== "PENDING") {
  return c.json({ error: "Already processed" }, 400);
}
```

### Audit Trail

#### Trackable Fields
- ✅ `createdAt`: Request creation time
- ✅ `updatedAt`: Latest state change
- ✅ `message`: Approval/rejection feedback
- ✅ `status`: Current state for queries

---

## 10. API Usage Examples

### Example 1: Complete Publishing Flow

```bash
# Step 1: Author requests publishing
curl -X POST http://localhost:3001/api/publish/posts/clpost123/request \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<author_token>" \
  -d '{
    "message": "Ready for review - added citations as requested"
  }'

# Response 201 Created
# { "id": "clreq456", "status": "PENDING", ... }

# Step 2: Admin reviews pending requests
curl http://localhost:3001/api/publish/requests?status=PENDING \
  -H "Cookie: better-auth.session_token=<admin_token>"

# Response 200 OK
# { "requests": [ { "id": "clreq456", ... } ] }

# Step 3: Admin approves
curl -X POST http://localhost:3001/api/publish/requests/clreq456/approve \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<admin_token>" \
  -d '{
    "message": "Looks great! Published."
  }'

# Response 200 OK
# { "status": "APPROVED", "post": { "status": "PUBLISHED" } }
```

### Example 2: Rejection and Resubmission

```bash
# Step 1: Request publishing
curl -X POST http://localhost:3001/api/publish/posts/clpost789/request \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<author_token>" \
  -d '{ "message": "First draft ready" }'

# Step 2: Admin rejects with feedback
curl -X POST http://localhost:3001/api/publish/requests/clreq789/reject \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<admin_token>" \
  -d '{
    "message": "Need more detail in methodology. Check grammar in para 3."
  }'

# Response 200 OK - Post reverted to DRAFT

# Step 3: Author revises and resubmits
curl -X POST http://localhost:3001/api/publish/posts/clpost789/request \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<author_token>" \
  -d '{
    "message": "Revised per feedback - expanded methodology"
  }'
```

### Example 3: Author Cancels Request

```bash
# Author changes mind before admin review
curl -X DELETE http://localhost:3001/api/publish/requests/clreq456 \
  -H "Cookie: better-auth.session_token=<author_token>"

# Response 200 OK
# { "message": "Publish request cancelled successfully" }
# Post automatically reverted to DRAFT
```

### Example 4: Admin Views Filtered Requests

```bash
# View all pending requests from specific author
curl "http://localhost:3001/api/publish/requests?authorId=clauthor123&status=PENDING" \
  -H "Cookie: better-auth.session_token=<admin_token>"

# View all approved requests
curl "http://localhost:3001/api/publish/requests?status=APPROVED" \
  -H "Cookie: better-auth.session_token=<admin_token>"
```

### Example 5: Author Tracks Own Requests

```bash
# Author views all their requests
curl http://localhost:3001/api/publish/my-requests \
  -H "Cookie: better-auth.session_token=<author_token>"

# Response 200 OK
# {
#   "requests": [
#     { "id": "clreq1", "status": "APPROVED", "post": { "status": "PUBLISHED" } },
#     { "id": "clreq2", "status": "PENDING", "post": { "status": "PENDING_APPROVAL" } }
#   ]
# }
```

---

## Summary

The **Publishing Approval Workflow** provides:

✅ **Comprehensive editorial control** through mandatory admin approval
✅ **Data consistency** via atomic transactions and unique constraints
✅ **Granular security** with RBAC and ownership verification
✅ **Clear communication** through optional feedback messages
✅ **Complete audit trail** via timestamps and status history
✅ **Robust error handling** for all edge cases
✅ **Efficient workflows** with filtering and querying capabilities

The implementation follows REST API best practices, state machine design principles, and database transaction patterns to ensure reliability, security, and maintainability.

---

## Related Documentation

- [Architecture Guide](../../ARCHITECTURE.md) - Full technical architecture
- [API Reference](../../README.md) - Complete API documentation
- [Database Schema](../../prisma/schema.prisma) - Full data model

---

*Last Updated: 2024-01-15*
