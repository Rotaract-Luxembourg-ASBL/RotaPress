"use client";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { PageHeading, Notice, Loading } from "@/ui/primitives";
import type { LumaAvailabilityDto } from "../luma_schemas";
import { LumaConnectionPanel } from "./luma-connection-panel";
import { LumaAvailabilityControl } from "./luma-availability-control";
import { LumaWebhookPanel } from "./luma-webhook-panel";

export function LumaSettings() {
  const { data, error, refresh } = useResource<LumaAvailabilityDto>(
    "/api/admin/integrations/luma",
  );
  return (
    <>
      <PageHeading
        title="Luma settings"
        description="Manage registration links and your optional calendar API connection."
      >
        <Link href="/admin/integrations" className="button button-outline">
          All integrations
        </Link>
      </PageHeading>
      <div className="form-stack integration-settings">
        {error && (
          <Notice>
            {error}{" "}
            <button className="inline-button" onClick={refresh}>
              Reload settings
            </button>
          </Notice>
        )}
        {!data && !error && <Loading />}
        {data && !error && (
          <section className="panel form-stack" aria-label="Luma link mode">
            <div>
              <h2>Luma link mode</h2>
              <p>
                Let event managers publish a validated registration link. No API
                key or subscription is needed for link mode.
              </p>
            </div>
            <p
              className={`status-badge ${data.enabled ? "status-approved" : ""}`}
            >
              {data.enabled ? "Enabled" : "Disabled"}
            </p>
            <p>
              {data.publishedLinkCount} saved published{" "}
              {data.publishedLinkCount === 1 ? "link" : "links"}. Each event
              needs its own publication and enabled Registration feature.
            </p>
            <p>
              Link mode does not import guests or verify ticket/payment status.
              Manage provider bookings directly in Luma.
            </p>
            <div>
              <LumaAvailabilityControl data={data} onSaved={refresh} />
            </div>
          </section>
        )}
        <LumaConnectionPanel />
        <LumaWebhookPanel />
      </div>
    </>
  );
}
