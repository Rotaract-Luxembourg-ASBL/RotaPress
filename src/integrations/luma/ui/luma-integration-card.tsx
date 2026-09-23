"use client";
import { useResource } from "@/ui/api";
import type { LumaAvailabilityDto } from "../luma_schemas";
import {
  type LumaConnectionDto,
  connectionStateLabels,
} from "../connection_schemas";
import { IntegrationCard } from "../../ui/integration-card";
import { LumaAvailabilityControl } from "./luma-availability-control";
import { useCurrentUser } from "@/ui/admin-shell";

export function LumaIntegrationCard() {
  const { features } = useCurrentUser();
  const availability = useResource<LumaAvailabilityDto>(
    "/api/admin/integrations/luma",
  );
  const connection = useResource<LumaConnectionDto>(
    "/api/admin/integrations/luma/connection",
  );
  const enabled = availability.error ? undefined : availability.data?.enabled;
  return (
    <IntegrationCard
      name="Luma"
      category="Events & registration"
      icon="calendar"
      description="Publish registration links and optionally import guests from your Luma calendar."
      enabled={enabled}
      state={
        availability.error
          ? "Unavailable"
          : enabled === undefined
            ? "Loading…"
            : enabled
              ? "Enabled"
              : "Disabled"
      }
      settingsHref="/admin/integrations/luma"
      connection={
        <>
          {!features.events && (
            <p>
              Event operations and webhooks are paused while Events is disabled.
            </p>
          )}
          <span className="integration-detail-label">
            API connection · optional
          </span>
          <span>
            {connection.error
              ? "Status unavailable"
              : !connection.data
                ? "Loading connection…"
                : connection.data.mode === "fixture" &&
                    connection.data.state === "verified"
                  ? "Synthetic connection checked"
                  : connectionStateLabels[connection.data.state]}
          </span>
          {connection.error && (
            <button className="inline-button" onClick={connection.refresh}>
              Retry connection status
            </button>
          )}
        </>
      }
    >
      {availability.error ? (
        <button
          className="button button-outline"
          onClick={availability.refresh}
        >
          Retry availability
        </button>
      ) : (
        availability.data && (
          <LumaAvailabilityControl
            data={availability.data}
            onSaved={availability.refresh}
          />
        )
      )}
    </IntegrationCard>
  );
}
