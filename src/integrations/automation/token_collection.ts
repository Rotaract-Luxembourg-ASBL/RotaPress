import { z } from "zod";
import {
  automationTransport,
  type AutomationTransport,
} from "./availability_schemas";
import type { AutomationScope } from "./scopes";

export const tokenCollectionInput = z.strictObject({
  transport: automationTransport.optional(),
  search: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AutomationConnection = {
  id: string;
  transport: AutomationTransport;
  name: string | null;
  expiresAt: string | null;
  expired: boolean;
  enabled: boolean;
  scopes: AutomationScope[];
  sourceOrigins: string[];
  currentSession: boolean;
};
export type TokenCollection = {
  connections: AutomationConnection[];
  total: number;
  page: number;
  pageSize: number;
};
