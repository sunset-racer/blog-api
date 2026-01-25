import { z } from "zod";

export const getUsersQuerySchema = z.object({
    search: z.string().optional(),
    role: z.enum(["ADMIN", "AUTHOR", "READER"]).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;
