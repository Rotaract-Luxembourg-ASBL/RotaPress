"use client";
import { useState } from "react";
import {
  featureCatalogue,
  type FeatureState,
} from "@/core/features/feature_catalogue";
import { request, errorMessage, useResource } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import { IntegrationCard } from "./integration-card";

function FeatureCard({
  state,
  refresh,
}: {
  state: FeatureState;
  refresh: () => void;
}) {
  const feature = featureCatalogue[state.key];
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <IntegrationCard
        name={feature.name}
        category="Built-in feature"
        description={feature.description}
        icon={state.key === "forms" ? "forms" : "calendar"}
        enabled={state.enabled}
        state={state.enabled ? "Enabled" : "Disabled"}
        connection={
          <p>
            {state.enabled
              ? "Ready to use. No external account needed."
              : "Saved content and settings are kept. Enable to use this feature."}
          </p>
        }
        settingsHref={state.enabled ? feature.href : undefined}
        settingsLabel="Manage"
      >
        <button
          className={`button ${state.enabled ? "button-outline" : "button-accent"}`}
          onClick={() => {
            setReview(true);
            setConfirmed(false);
            setError(undefined);
          }}
        >
          {state.enabled ? "Disable" : "Enable"} {feature.name}
        </button>
      </IntegrationCard>
      {review && (
        <Dialog
          title={`Review ${feature.name} availability`}
          onClose={() => setReview(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              {state.enabled ? feature.disableImpact : feature.enableImpact}
            </p>
            <p>
              This applies to the whole club. Content, permissions, revisions
              and saved settings are retained. Previously queued notifications
              and scheduled event work will need a new review; enabling does not
              replay them.
            </p>
            {error && (
              <Notice>
                {error}{" "}
                <button
                  className="inline-button"
                  disabled={busy}
                  onClick={() => {
                    setReview(false);
                    refresh();
                  }}
                >
                  Reload features
                </button>
              </Notice>
            )}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirm this change and its effect on dependent features for the
              whole club.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  await request("/api/admin/integrations/features", {
                    method: "POST",
                    body: JSON.stringify({
                      key: state.key,
                      enabled: !state.enabled,
                      expectedVersion: state.version,
                      confirmed: true,
                    }),
                  });
                  setReview(false);
                  refresh();
                  window.dispatchEvent(new Event("club-features-updated"));
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : `Confirm ${feature.name} availability`}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function BuiltinFeatureCards() {
  const { data, error, refresh } = useResource<{ features: FeatureState[] }>(
    "/api/admin/integrations/features",
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    );
  if (!data) return <Loading />;
  return data.features.map((state) => (
    <FeatureCard
      key={`${state.key}-${state.version}`}
      state={state}
      refresh={refresh}
    />
  ));
}
