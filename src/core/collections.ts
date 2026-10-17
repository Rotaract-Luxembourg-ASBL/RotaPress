import { z } from "zod";

export const collectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
  search: z.string().trim().max(160).default(""),
});

export function searchPattern(value: string) {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}

export function collectionPage(
  total: number,
  requested: number,
  pageSize: number,
) {
  return Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
}

export type CollectionPage = { total: number; page: number; pageSize: number };
