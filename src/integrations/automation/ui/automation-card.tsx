"use client";
import { useState } from "react";
import { IntegrationCard } from "@/integrations/ui/integration-card";
import { request, useResource, errorMessage } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import {
  transportDescriptions,
  type AutomationAvailabilityState,
} from "../availability_schemas";

const endpoint = "/api/admin/integrations/automation/availability";
export function AutomationCard() {
  const { data, error, refresh } = useResource<{
    items: AutomationAvailabilityState[];
  }>(endpoint);
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Reload connections
        </button>
      </Notice>
    );
  if (!data) return <Loading />;
  return data.items.map((state) => (
    <TransportCard key={state.kind} state={state} refresh={refresh} />
  ));
}
function TransportCard({
  state,
  refresh,
}: {
  state: AutomationAvailabilityState;
  refresh: () => void;
}) {
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const feature = transportDescriptions[state.kind];
  return (
    <>
      <IntegrationCard
        name={feature.name}
        category="Content automation"
        icon="website"
        enabled={state.enabled}
        state={state.enabled ? "Enabled" : "Disabled"}
        description={feature.description}
        connection={
          <p>
            {state.enabled
              ? "Available to authorized connections. Content changes stay private drafts."
              : "External access is off. Saved content and connection settings are retained."}
          </p>
        }
        settingsHref={feature.href}
        settingsLabel={feature.settingsLabel}
      >
        <button
          className={`button ${state.enabled ? "button-outline" : "button-accent"}`}
          onClick={() => {
            setError(undefined);
            setReview(true);
          }}
        >
          {state.enabled ? "Disable" : "Enable"} {feature.name}
        </button>
      </IntegrationCard>
      {review && (
        <Dialog
          title={`${state.enabled ? "Disable" : "Enable"} ${feature.name}`}
          onClose={() => setReview(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              {state.enabled
                ? `New ${feature.name} requests will be blocked, including requests using existing credentials. An operation already completing may finish.`
                : `Valid, scoped connections will be able to use ${feature.name}. Existing unexpired connections resume; revoke any you no longer trust before enabling.`}
            </p>
            <p>
              This changes only {feature.name}. The other integration has its
              own control. Content, permissions and saved connection settings
              are retained.
            </p>
            {error && (
              <Notice>
                {error}{" "}
                <button
                  className="inline-button"
                  onClick={() => {
                    setReview(false);
                    refresh();
                  }}
                >
                  Reload integrations
                </button>
              </Notice>
            )}
            <button
              className="button button-accent"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  await request(endpoint, {
                    method: "POST",
                    body: JSON.stringify({
                      kind: state.kind,
                      enabled: !state.enabled,
                      expectedVersion: state.version,
                      confirmed: true,
                    }),
                  });
                  setReview(false);
                  refresh();
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Saving…"
                : `Confirm ${state.enabled ? "disable" : "enable"} ${feature.name}`}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
