"use client";

import type { GoogleAuthSettings } from "@/core/auth/google_auth_schemas";
import { useResource } from "@/ui/api";
import { IntegrationCard } from "../../ui/integration-card";

export function GoogleIntegrationCard() {
  const { data, error, refresh } = useResource<GoogleAuthSettings>(
    "/api/admin/integrations/google",
  );
  return (
    <IntegrationCard
      name="Google sign-in"
      category="Identity & access"
      icon="members"
      description="Let people sign in with Google and manage your club's Google authentication connection."
      enabled={error ? undefined : data?.enabled}
      state={
        error
          ? "Unavailable"
          : !data
            ? "Loading…"
            : data.enabled
              ? "Enabled"
              : data.configured
                ? "Saved · disabled"
                : "Not configured"
      }
      settingsHref="/admin/integrations/google"
      settingsLabel="Set up"
      connection={
        <>
          <span className="integration-detail-label">
            Google authentication
          </span>
          <span>
            {error
              ? "Status unavailable"
              : !data
                ? "Loading settings…"
                : data.verifiedAt
                  ? "Successful Google sign-in recorded"
                  : "Not yet verified with Google"}
          </span>
          {data?.staffRequiresGoogle && (
            <span>
              Required for staff, members and guests by the club sign-in policy.
            </span>
          )}
        </>
      }
    >
      {error ? (
        <button className="button button-outline" onClick={refresh}>
          Retry status
        </button>
      ) : (
        <span className="integration-detail-label">
          Owner-managed credentials
        </span>
      )}
    </IntegrationCard>
  );
}
