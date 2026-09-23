import { z } from "zod";
import type { EventFields } from "../events/event_schemas";
import type { EventModuleState } from "../events/event_modules";

export const grantGuestSchema = z
  .object({
    source: z.enum(["native", "luma"]),
    sourceId: z.uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export const revokeGuestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmed: z.literal(true),
  })
  .strict();
export const claimGuestSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();

export type GuestWorkspace = {
  modules: EventModuleState[];
  published: boolean;
  candidates: {
    source: "native" | "luma";
    id: string;
    sourceId?: string;
    sourceLabel?: string;
    name: string;
    email: string;
    status: string;
  }[];
  grants: {
    id: string;
    sourceId?: string;
    sourceLabel?: string;
    name: string;
    email: string;
    source: "native" | "luma";
    status: "invited" | "claimed" | "revoked";
    available: boolean;
    version: number;
  }[];
  limited: boolean;
};
export type GuestInvitation = {
  id: string;
  eventId: string;
  title: string;
  startsAt: string;
  timezone: string;
  claimed: boolean;
};
export type GuestPortal = {
  id: string;
  eventId: string;
  event: EventFields;
  booking: {
    source: "native" | "luma";
    status: string;
    observedAt: string | null;
  };
};
