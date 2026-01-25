import { z } from "zod";

export const deleteUploadSchema = z.object({
    path: z.string().min(1, "Path is required"),
});

export type DeleteUploadInput = z.infer<typeof deleteUploadSchema>;
