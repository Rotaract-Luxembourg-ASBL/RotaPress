import "server-only";
import { randomBytes } from "node:crypto";
import { DomainError } from "@/core/DomainError";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import type { PublicPage, PublicSite } from "@/features/cms/cms_schemas";
import type { EventFields } from "@/features/events/event_schemas";

export const previewDocumentPath = "/automation-preview";
export type PreviewDocument = {
  page: PublicPage;
  site: PublicSite;
  club: PublicOrganization | null;
  event: {
    id: string;
    version: number;
    cancelled: boolean;
    fields: EventFields;
  } | null;
};
type Ticket = {
  document: PreviewDocument;
  expiresAt: number;
  audience: string;
};
type PreviewState = { busy: boolean; tickets: Map<string, Ticket> };
const stateKey = Symbol.for("rotapress.automation-preview.v1");
const globalState = globalThis as typeof globalThis & {
  [stateKey]?: PreviewState;
};
const state = (globalState[stateKey] ??= { busy: false, tickets: new Map() });

/** Shared across Next server bundles, never across hosts or persisted to disk. */
export function claimPreviewRenderer() {
  if (state.busy)
    throw new DomainError(
      "PREVIEW_BUSY",
      "Another visual preview is running. Retry shortly.",
      429,
    );
  state.busy = true;
  return () => {
    state.busy = false;
  };
}

export function issuePreviewDocument(
  document: PreviewDocument,
  now = Date.now(),
) {
  for (const [token, ticket] of state.tickets)
    if (ticket.expiresAt <= now) state.tickets.delete(token);
  if (state.tickets.size >= 1)
    throw new DomainError(
      "PREVIEW_BUSY",
      "Another visual preview is running. Retry shortly.",
      429,
    );
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > 2 * 1024 * 1024)
    throw new DomainError(
      "PREVIEW_TOO_LARGE",
      "This page is too large for visual preview.",
      413,
    );
  const token = `rp_preview_${randomBytes(32).toString("base64url")}`;
  state.tickets.set(token, {
    document,
    expiresAt: now + 30000,
    audience: previewDocumentPath,
  });
  return {
    token,
    revoke: () => {
      state.tickets.delete(token);
    },
  };
}

/** A single loopback SSR request consumes this capability; it is never a login. */
export function takePreviewDocument(
  headers: Headers,
  now = Date.now(),
): PreviewDocument | null {
  const token = /^Bearer (rp_preview_[A-Za-z0-9_-]{43})$/.exec(
    headers.get("authorization") ?? "",
  )?.[1];
  if (!token) return null;
  const ticket = state.tickets.get(token);
  state.tickets.delete(token);
  if (
    !ticket ||
    ticket.expiresAt <= now ||
    ticket.audience !== previewDocumentPath
  )
    return null;
  return ticket.document;
}
