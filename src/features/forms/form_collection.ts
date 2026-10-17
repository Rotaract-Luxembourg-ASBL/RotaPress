import { z } from "zod";
import type { FormDto } from "./form_types";

export const formCollectionSchema = z.strictObject({
  search: z.string().trim().max(160).default(""),
  status: z
    .enum(["all", "active", "published", "draft", "archived"])
    .default("all"),
  kind: z
    .enum(["all", "contact", "membership", "event", "registration"])
    .default("all"),
  sort: z.enum(["updated", "name", "responses"]).default("updated"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export type FormCollection = {
  forms: FormDto[];
  page: number;
  pageSize: number;
  total: number;
  counts: {
    all: number;
    active: number;
    published: number;
    draft: number;
    archived: number;
    changes: number;
  };
};
