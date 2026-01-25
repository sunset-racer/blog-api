# TechBlog API

REST API for a technical blogging platform with authentication, role-based authorization, and content management.

## Tech Stack

- **Runtime**: Bun v1.3+
- **Framework**: Hono v4.11+
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma v7.2+
- **Auth**: Better-Auth v1.4+
- **Validation**: Zod v4.3+
- **Storage**: Supabase Storage

## Features

- Email/password authentication with session management
- Role-based access control (ADMIN, AUTHOR, READER)
- Posts CRUD with draft/publish workflow
- Admin approval system for publishing posts
- Tag management
- Image uploads
- Full-text search and filtering
- Pagination and sorting
- Automatic slug generation

## Installation

```bash
# Install dependencies
bun install

# Edit .env with your configuration
.env

# Run database migrations
bun run db:generate
bun run db:migrate
```

## Environment Variables

Please check the .env.example for the format and setup your own .env file

## Running

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start
```

## Roles

| Role | Permissions |
|------|-------------|
| READER | View published posts |
| AUTHOR | Create posts, request publishing |
| ADMIN | Full access, approve/reject posts |

Set user roles manually in database or using Prisma Studio:

### For example (default role: READER):

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'johndoe@example.com';

UPDATE users SET role = 'AUTHOR' WHERE email = 'john@example.com';
```

## Scripts

```bash
bun run dev          # Development server
bun run start        # Production server
bun run db:generate  # Generate Prisma client
bun run db:migrate   # Run migrations
bun run db:studio    # Open Prisma Studio
prettier . --write   # Format using Prettier
```

## Always update dependencies

```bash
# Update Packages
bun update

# Check for Audit
bun audit

# Update Runtime
bun upgrade
```
