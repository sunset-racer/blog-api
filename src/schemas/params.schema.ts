import { z } from "zod";

const cuidParam = z.string().regex(/^c[0-9a-z]{24}$/i, "Invalid id");
const slugParam = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug");

export const idParamSchema = z.object({ id: cuidParam });
export const postIdParamSchema = z.object({ postId: cuidParam });
export const commentIdParamSchema = z.object({ id: cuidParam });
export const requestIdParamSchema = z.object({ requestId: cuidParam });
export const userIdParamSchema = z.object({ id: cuidParam });
export const tagIdParamSchema = z.object({ id: cuidParam });
export const postSlugParamSchema = z.object({ slug: slugParam });
export const tagSlugParamSchema = z.object({ slug: slugParam });

export type IdParam = z.infer<typeof idParamSchema>;
export type PostIdParam = z.infer<typeof postIdParamSchema>;
export type CommentIdParam = z.infer<typeof commentIdParamSchema>;
export type RequestIdParam = z.infer<typeof requestIdParamSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type TagIdParam = z.infer<typeof tagIdParamSchema>;
export type PostSlugParam = z.infer<typeof postSlugParamSchema>;
export type TagSlugParam = z.infer<typeof tagSlugParamSchema>;
