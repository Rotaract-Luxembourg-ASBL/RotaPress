"use client";

import { useCallback, useEffect, useState } from "react";
import { en } from "@/locales/en";
import type { FeatureFlags } from "@/core/features/feature_catalogue";
import type { ClubProfile, StaffLogin } from "@/core/organization/club_profile";

export type ClubSettings = {
  name: string;
  tagline: string;
  description: string;
  locale: string;
  timezone: string;
  accentColor: string;
  profile: ClubProfile;
};

export type AdminSettings = ClubSettings & {
  staffAuthPolicy: "email-or-google" | "google";
  staffLogin: StaffLogin;
};

export type MembershipStatus =
  "pending" | "approved" | "suspended" | "rejected" | "former";
export type MembershipRole = "owner" | "administrator" | "editor" | "member";

export type CurrentUser = {
  actor: { email: string; name?: string } | null;
  membership: { status: MembershipStatus; role: MembershipRole } | null;
  capabilities: string[];
  features: FeatureFlags;
  installed: boolean;
  setupEmailReady: boolean;
  setupClaimReady: boolean;
  googleConfigured: boolean;
};

export type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: MembershipStatus;
  role: MembershipRole;
};

/** An HTTP rejection is distinct from an uncertain network/response failure. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) throw new ApiError(en.common.error, response.status);
    throw new Error(en.common.error);
  }
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : en.common.error;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : en.common.error;
}

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    let active = true;
    request<T>(path)
      .then((value) => {
        if (active) {
          setData(value);
          setError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [path, revision]);

  return { data, error, refresh };
}
