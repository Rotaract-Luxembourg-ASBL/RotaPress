import { z } from "zod";
import type { AutomationScope } from "../scopes";

export const oauthCollectionInput = z.strictObject({
  search: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type OAuthClient = {
  clientId: string;
  name: string | null;
  disabled: boolean;
  redirectUris: string[];
  scopes: AutomationScope[];
  sourceOrigins: string[];
  authentication: string | null;
  createdAt: string | null;
  permissionsRevision: string;
  approvedScopes: AutomationScope[];
  consentedAt: string | null;
  lastUsedAt: string | null;
};

export type OAuthConnectionCollection = {
  clients: OAuthClient[];
  total: number;
  page: number;
  pageSize: number;
};
