"use client";

import { Icon } from "@/ui/icon";
import { Notice } from "@/ui/primitives";
import type { EventReadiness } from "../event_readiness";
import {
  eventFeaturePresentation,
  featureReadinessStatus,
  participationPlacementNote,
} from "./event-feature-catalogue";

export function EventReadinessSummary({
  readiness,
  error,
  onOpen,
  canManageGuests,
  canEditEvent,
}: {
  readiness?: EventReadiness;
  error?: string;
  onOpen: (section: string) => void;
  canManageGuests: boolean;
  canEditEvent: boolean;
}) {
  const features = readiness?.modules.filter(
    (module) => module.state !== "disabled",
  );
  return (
    <section className="event-readiness panel" aria-label="Event readiness">
      <div className="event-readiness-heading">
        <h3>Guest experience</h3>
        <p className="field-help">
          Check what is published and what still needs setup.
        </p>
      </div>
      {error ? (
        <Notice>Guest experience could not be checked. {error}</Notice>
      ) : !readiness ? (
        <p className="field-help" role="status">
          Checking guest experience…
        </p>
      ) : features?.length ? (
        <ul className="event-readiness-list">
          {features.map((module) => {
            const feature = eventFeaturePresentation[module.key];
            const status = featureReadinessStatus(
              module.key,
              module.state,
              readiness,
            );
            const placementNote =
              module.state === "enabled"
                ? participationPlacementNote(module.key, readiness)
                : null;
            return (
              <li className="event-readiness-row" key={module.key}>
                <Icon name={feature.icon} />
                <div className="event-readiness-content">
                  <div className="event-readiness-title">
                    <h4>{feature.label}</h4>
                    <span
                      className={`event-readiness-badge event-readiness-${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  {status.reasons[0] && (
                    <p className="field-help">{status.reasons[0]}</p>
                  )}
                  {placementNote && (
                    <p className="field-help">{placementNote}</p>
                  )}
                </div>
                {(module.key !== "portal" || canManageGuests) &&
                  (module.key !== "prizes" || canEditEvent) && (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => onOpen(feature.section)}
                      aria-label={`Review ${feature.label.toLowerCase()}`}
                    >
                      Review
                    </button>
                  )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="event-readiness-empty">
          <p className="field-help">
            No guest features added. Choose the tools this event needs.
          </p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => onOpen("features")}
          >
            Add features
          </button>
        </div>
      )}
    </section>
  );
}
