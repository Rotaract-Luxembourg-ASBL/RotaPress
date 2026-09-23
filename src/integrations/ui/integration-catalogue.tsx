"use client";
import { PageHeading, Notice } from "@/ui/primitives";
import { useCurrentUser } from "@/ui/admin-shell";
import { LumaIntegrationCard } from "../luma/ui/luma-integration-card";
import { BuiltinFeatureCards } from "./builtin-feature-cards";
import { GoogleIntegrationCard } from "../google/ui/google-integration-card";
import { EmailIntegrationCard } from "../email/ui/email-integration-card";
import { SummaryStats } from "@/ui/collection";

export function IntegrationCatalogue() {
  const { capabilities, features } = useCurrentUser();
  const enabled = Object.values(features).filter(Boolean).length;
  return (
    <>
      <PageHeading
        title="Integrations"
        description="Choose the built-in features and connected services your club uses."
      />
      {capabilities.includes("integrations.manage") ? (
        <>
          <SummaryStats
            label="Feature counts"
            items={[
              {
                label: "Built-in features",
                value: Object.keys(features).length,
                hint: "Included with this installation",
                icon: "overview",
              },
              {
                label: "Enabled",
                value: enabled,
                hint: "Available to authorized staff",
                icon: "check",
              },
              {
                label: "Disabled",
                value: Object.keys(features).length - enabled,
                hint: "Saved content is retained",
                icon: "archive",
              },
            ]}
          />
          <section
            className="integration-section"
            aria-labelledby="builtin-features-title"
          >
            <h2 id="builtin-features-title">Built-in features</h2>
            <p className="muted">
              Choose the tools your club uses. No external account is required.
            </p>
            <div className="integration-grid" aria-label="Built-in features">
              <BuiltinFeatureCards />
            </div>
          </section>
          <section
            className="integration-section"
            aria-labelledby="connected-services-title"
          >
            <h2 id="connected-services-title">Connected services</h2>
            <p className="muted">
              Configure sign-in, registration providers and email delivery.
            </p>
            <div className="integration-grid" aria-label="Connected services">
              <LumaIntegrationCard />
              <GoogleIntegrationCard />
              <EmailIntegrationCard />
            </div>
          </section>
          <p className="integration-catalogue-note">
            Disabled features are hidden from administration navigation. Your
            website, media, membership permissions and club settings stay
            available. Event managers still choose features separately for each
            event.
          </p>
        </>
      ) : (
        <Notice>Your current club role cannot manage integrations.</Notice>
      )}
    </>
  );
}
