"use client";

import { useState } from "react";
import { errorMessage, request } from "@/ui/api";
import { Icon, type IconName } from "@/ui/icon";
import { Notice } from "@/ui/primitives";
import {
  eventModules,
  type EventModuleKey,
  type EventModuleState,
} from "../event_modules";
import type { EventDraft } from "../event_schemas";
import type { EventReadiness } from "../event_readiness";

export const eventFeaturePresentation: Record<
  EventModuleKey,
  { icon: IconName; label: string; section: string; description: string }
> = {
  prizes: {
    icon: "image",
    label: "Prizes",
    section: "prizes",
    description:
      "Prepare and publish a prize gallery with images, quantities and donor profiles.",
  },
  website: {
    icon: "website",
    label: "Event page",
    section: "website",
    description: "Build and publish your event's own page.",
  },
  gallery: {
    icon: "image",
    label: "Photo gallery",
    section: "website",
    description: "Share selected event photos on a gallery page.",
  },
  sponsors: {
    icon: "members",
    label: "Sponsors",
    section: "website",
    description: "Give your event's sponsors their own page.",
  },
  forms: {
    icon: "forms",
    label: "Forms",
    section: "participation",
    description: "Collect enquiries and prepare registration questions.",
  },
  registration: {
    icon: "calendar",
    label: "Registration",
    section: "participation",
    description:
      "Let people register for your event. Configure a form before opening sign-up.",
  },
  portal: {
    icon: "members",
    label: "Guest portal",
    section: "guests",
    description:
      "Invite guests to privately view their own booking and event information.",
  },
};

export function featureReadinessStatus(
  key: EventModuleKey,
  state: EventModuleState["state"],
  readiness?: EventReadiness,
  error?: string,
): {
  label: string;
  tone: "ready" | "attention" | "neutral";
  reasons: string[];
} {
  if (state === "disabled")
    return { label: "Not added", tone: "neutral", reasons: [] };
  if (error)
    return { label: "Status unavailable", tone: "neutral", reasons: [] };
  const featureState = readiness?.modules.find((item) => item.key === key);
  if (!readiness || !featureState)
    return { label: "Checking setup", tone: "neutral", reasons: [] };
  const reasons = featureState.reasons;
  if (state === "suspended")
    return { label: "Paused", tone: "attention", reasons };
  if (readiness.archived)
    return { label: "Archived", tone: "neutral", reasons };
  if (key !== "portal" && readiness.publishedVisibility === "private")
    return { label: "Staff only", tone: "neutral", reasons };
  if (key === "registration") {
    if (readiness.registration.available)
      return {
        label:
          readiness.registration.authority === "luma"
            ? "Booking link ready"
            : "Accepting registrations",
        tone: "ready",
        reasons,
      };
    if (readiness.cancelled)
      return { label: "Closed", tone: "attention", reasons };
    if (readiness.eventPublished && readiness.registration.full)
      return { label: "Full", tone: "attention", reasons };
    if (
      readiness.eventPublished &&
      readiness.registration.formPublished &&
      !readiness.registration.open
    )
      return { label: "Closed", tone: "attention", reasons };
  }
  if (featureState.available)
    return {
      label:
        key === "forms"
          ? readiness.forms.publishedCount === 0 &&
            readiness.registration.formPublished
            ? "Registration questions ready"
            : "Forms ready"
          : key === "portal"
            ? "Ready to invite"
            : "Published",
      tone: "ready",
      reasons,
    };
  return { label: "Needs setup", tone: "attention", reasons };
}

export function participationPlacementNote(
  key: EventModuleKey,
  readiness: EventReadiness,
) {
  if (key !== "forms" && key !== "registration") return null;
  if (readiness.archived) return null;
  if (
    key === "forms" &&
    readiness.forms.publishedCount === 0 &&
    !readiness.forms.placement.draft &&
    !readiness.forms.placement.published &&
    readiness.registration.formPublished
  )
    return null;
  const { placement } = readiness[key];
  if (placement.live) return "Visible on the published event page.";
  if (placement.published)
    return "Section is published. Review setup before guests can use it.";
  if (placement.draft)
    return "Section is visible in the saved draft. Publish the page to show it to guests.";
  return "No visible section on the page. Add or unhide it in the page editor.";
}

export function EventFeatureCatalogue({
  event,
  modules,
  registrationAuthority,
  disabled,
  onSaved,
  onOpen,
  readiness,
  readinessError,
}: {
  event: EventDraft;
  modules: EventModuleState[];
  registrationAuthority: "none" | "native" | "luma";
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
  onOpen: (section: string) => void;
  readiness?: EventReadiness;
  readinessError?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canManage = event.capabilities.includes("events.modules.manage");
  const locked =
    disabled || busy || event.archived || event.cancelled || !canManage;
  async function add(key: EventModuleKey) {
    if (
      !window.confirm(
        `Add ${eventFeaturePresentation[key].label} to this event? Required features are included. Retained published content becomes available again if the event is published.`,
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    let current = event;
    try {
      const required: EventModuleKey[] =
        key === "registration" && registrationAuthority !== "luma"
          ? ["website", "forms", "registration"]
          : [...eventModules[key].dependencies, key];
      for (const feature of required) {
        if (
          modules.some(
            (item) => item.key === feature && item.state === "enabled",
          )
        )
          continue;
        current = await request<EventDraft>(
          `/api/admin/events/${event.id}/modules`,
          {
            method: "POST",
            body: JSON.stringify({
              key: feature,
              operation: "enable",
              expectedVersion: current.version,
              confirmed: true,
              suspendDependents: false,
            }),
          },
        );
      }
      onSaved(current);
      onOpen(eventFeaturePresentation[key].section);
    } catch (cause) {
      // Keep a successfully enabled dependency visible if a later step fails.
      if (current !== event) onSaved(current);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <Notice>{error}</Notice>}
      {readinessError && (
        <Notice>Feature status could not be checked. {readinessError}</Notice>
      )}
      <div className="event-feature-grid">
        {(Object.keys(eventModules) as EventModuleKey[]).map((key) => {
          const feature = eventFeaturePresentation[key];
          const state =
            modules.find((module) => module.key === key)?.state ?? "disabled";
          const enabled = state === "enabled";
          const status = featureReadinessStatus(
            key,
            state,
            readiness,
            readinessError,
          );
          const placementNote =
            readiness && !readinessError && enabled
              ? participationPlacementNote(key, readiness)
              : null;
          const accessible =
            (key !== "portal" ||
              event.capabilities.includes("events.guests.manage")) &&
            (key !== "prizes" || event.capabilities.includes("events.edit"));
          return (
            <article className="event-feature-choice" key={key}>
              <Icon name={feature.icon} />
              <div>
                <h3>{feature.label}</h3>
                <p className="field-help">{feature.description}</p>
                <span
                  className={`event-readiness-badge event-readiness-${status.tone}`}
                >
                  {status.label}
                </span>
                {state !== "disabled" && status.reasons.length > 0 && (
                  <p className="field-help event-readiness-reason">
                    {status.reasons[0]}
                  </p>
                )}
                {placementNote && (
                  <p className="field-help event-readiness-reason">
                    {placementNote}
                  </p>
                )}
                {!enabled && eventModules[key].dependencies.length > 0 && (
                  <p className="field-help">
                    Includes the event page if it has not been added.
                  </p>
                )}
                <div className="form-actions">
                  {!enabled && (
                    <button
                      type="button"
                      className="button button-accent"
                      disabled={locked}
                      onClick={() => void add(key)}
                    >
                      {state === "suspended" ? "Enable" : "Add"} {feature.label}
                    </button>
                  )}
                  {accessible && (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => onOpen(feature.section)}
                    >
                      {enabled ? "Manage" : "View settings & saved content"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="panel form-stack event-secondary-actions">
        <h3>Packages & tickets</h3>
        <p className="field-help">
          Manage package offers and optional Luma checkout destinations in
          Packages, available with Website. Add Published packages in the event
          page editor to display published offers. Checkout takes place on Luma;
          purchases do not issue local tickets or guest access.
        </p>
        <div>
          <button
            type="button"
            className="button button-outline"
            onClick={() => onOpen("packages")}
          >
            Manage packages
          </button>
        </div>
      </div>
    </>
  );
}
