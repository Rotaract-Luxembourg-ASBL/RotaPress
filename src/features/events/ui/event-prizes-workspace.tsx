"use client";

import { useCallback, useRef, useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { EventPrizesPanel as PrizeGallery } from "./event-prizes-panel";
import { EventEntriesPanel } from "./event-entries-panel";
import { EventDrawsPanel } from "./event-draws-panel";

const tabs = ["gallery", "entries", "draws"] as const;
type Tab = (typeof tabs)[number];

/** Gallery drafts stay mounted when a manager switches to private entry review. */
export function EventPrizesPanel(props: ComponentProps<typeof PrizeGallery>) {
  const search = useSearchParams();
  const canReview = props.event.capabilities.includes("events.entries.manage");
  const selected: Tab =
    canReview && search.get("prizeView") === "draws"
      ? "draws"
      : canReview && search.get("prizeView") === "entries"
        ? "entries"
        : "gallery";
  const [entriesOpened, setEntriesOpened] = useState(selected === "entries");
  const [drawsOpened, setDrawsOpened] = useState(selected === "draws");
  const changes = useRef({ gallery: false, entries: false, draws: false });
  const report = props.onDirtyChange;
  const galleryDirty = useCallback(
    (dirty: boolean) => {
      changes.current.gallery = dirty;
      report(Object.values(changes.current).some(Boolean));
    },
    [report],
  );
  const entriesDirty = useCallback(
    (dirty: boolean) => {
      changes.current.entries = dirty;
      report(Object.values(changes.current).some(Boolean));
    },
    [report],
  );
  const drawsDirty = useCallback(
    (dirty: boolean) => {
      changes.current.draws = dirty;
      report(Object.values(changes.current).some(Boolean));
    },
    [report],
  );
  function select(value: Tab) {
    if (value === "entries") setEntriesOpened(true);
    if (value === "draws") setDrawsOpened(true);
    const url = new URL(window.location.href);
    url.searchParams.set("prizeView", value);
    window.history.replaceState(null, "", url);
  }
  return (
    <div>
      {canReview && (
        <div
          className="prize-workspace-tabs"
          role="tablist"
          aria-label="Prize workspace"
        >
          {tabs.map((value, index) => (
            <button
              key={value}
              type="button"
              id={`prizes-${value}-tab`}
              role="tab"
              aria-selected={selected === value}
              aria-controls={`prizes-${value}-panel`}
              tabIndex={selected === value ? 0 : -1}
              onClick={() => select(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? tabs[0]
                    : event.key === "End"
                      ? tabs.at(-1)!
                      : tabs[
                          (index +
                            (event.key === "ArrowLeft" ? -1 : 1) +
                            tabs.length) %
                            tabs.length
                        ];
                select(next);
                document.getElementById(`prizes-${next}-tab`)?.focus();
              }}
            >
              {
                {
                  gallery: "Prize gallery",
                  entries: "Entries & review",
                  draws: "Draws & winners",
                }[value]
              }
            </button>
          ))}
        </div>
      )}
      <div
        id="prizes-gallery-panel"
        role="tabpanel"
        aria-labelledby={canReview ? "prizes-gallery-tab" : undefined}
        hidden={canReview && selected !== "gallery"}
      >
        <PrizeGallery
          {...props}
          active={props.active && (!canReview || selected === "gallery")}
          onDirtyChange={galleryDirty}
        />
      </div>
      {canReview && (
        <div
          id="prizes-entries-panel"
          role="tabpanel"
          aria-labelledby="prizes-entries-tab"
          hidden={selected !== "entries"}
        >
          {(entriesOpened || selected === "entries") && (
            <EventEntriesPanel
              eventId={props.event.id}
              active={props.active && selected === "entries"}
              disabled={props.disabled}
              onDirtyChange={entriesDirty}
            />
          )}
        </div>
      )}
      {canReview && (
        <div
          id="prizes-draws-panel"
          role="tabpanel"
          aria-labelledby="prizes-draws-tab"
          hidden={selected !== "draws"}
        >
          {(drawsOpened || selected === "draws") && (
            <EventDrawsPanel
              eventId={props.event.id}
              active={props.active && selected === "draws"}
              disabled={props.disabled}
              onDirtyChange={drawsDirty}
            />
          )}
        </div>
      )}
    </div>
  );
}
