import { Hono } from "hono";
import { requireAuth, requireRole, type AuthContext } from "@/middleware/auth";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/utils/validation";
import { createTagSchema, updateTagSchema } from "@/schemas/post.schema";
import { generateUniqueTagSlug } from "@/utils/slug";

const tags = new Hono<AuthContext>();

// ============================================
// GET ALL TAGS
// ============================================
tags.get("/", async (c) => {
  const allTags = await prisma.tag.findMany({
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return c.json({
    tags: allTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      postsCount: tag._count.posts,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    })),
  });
});

// ============================================
// GET SINGLE TAG BY SLUG
// ============================================
tags.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const tag = await prisma.tag.findUnique({
    where: { slug },
    include: {
      posts: {
        where: {
          post: {
            status: "PUBLISHED",
          },
        },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              coverImage: true,
              publishedAt: true,
              viewCount: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });

  if (!tag) {
    return c.json({ error: "Tag not found" }, 404);
  }

  return c.json({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    posts: tag.posts.map((pt) => pt.post),
    postsCount: tag._count.posts,
  });
});

// ============================================
// CREATE TAG (ADMIN only)
// ============================================
tags.post("/", requireAuth, requireRole("ADMIN"), async (c) => {
  const data = await validateBody(c, createTagSchema);
  if (!data) return;

  // Check if tag already exists
  const existing = await prisma.tag.findFirst({
    where: {
      name: {
        equals: data.name,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return c.json({ error: "Tag with this name already exists" }, 400);
  }

  const slug = await generateUniqueTagSlug(data.name);

  const tag = await prisma.tag.create({
    data: {
      name: data.name,
      slug,
    },
  });

  return c.json(tag, 201);
});

// ============================================
// UPDATE TAG (ADMIN only)
// ============================================
tags.put("/:id", requireAuth, requireRole("ADMIN"), async (c) => {
  const tagId = c.req.param("id");
  const data = await validateBody(c, updateTagSchema);
  if (!data) return;

  const existingTag = await prisma.tag.findUnique({
    where: { id: tagId },
  });

  if (!existingTag) {
    return c.json({ error: "Tag not found" }, 404);
  }

  // Check if another tag with this name exists
  const duplicate = await prisma.tag.findFirst({
    where: {
      name: {
        equals: data.name,
        mode: "insensitive",
      },
      id: {
        not: tagId,
      },
    },
  });

  if (duplicate) {
    return c.json({ error: "Tag with this name already exists" }, 400);
  }

  const slug = await generateUniqueTagSlug(data.name, tagId);

  const updatedTag = await prisma.tag.update({
    where: { id: tagId },
    data: {
      name: data.name,
      slug,
    },
  });

  return c.json(updatedTag);
});

// ============================================
// DELETE TAG (ADMIN only)
// ============================================
tags.delete("/:id", requireAuth, requireRole("ADMIN"), async (c) => {
  const tagId = c.req.param("id");

  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });

  if (!tag) {
    return c.json({ error: "Tag not found" }, 404);
  }

  // Optional: Prevent deletion if tag is used
  if (tag._count.posts > 0) {
    return c.json(
      {
        error: "Cannot delete tag with associated posts",
        postsCount: tag._count.posts,
      },
      400
    );
  }

  await prisma.tag.delete({
    where: { id: tagId },
  });

  return c.json({ message: "Tag deleted successfully" });
});

export default tags;
