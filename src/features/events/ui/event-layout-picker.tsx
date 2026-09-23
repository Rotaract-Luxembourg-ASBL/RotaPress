"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Dialog } from "@/ui/dialog";
import { eventLayouts, type EventLayoutId } from "../event_layouts";

export function EventLayoutPicker({
  onSelect,
  onClose,
  preserving = false,
}: {
  onSelect: (id: EventLayoutId) => void;
  onClose: () => void;
  preserving?: boolean;
}) {
  const [selected, setSelected] = useState<EventLayoutId>("reference");
  const layout = eventLayouts.find((item) => item.id === selected)!;
  return (
    <Dialog title="Choose an event layout" onClose={onClose}>
      <div className="event-layout-picker">
        <p>
          Ten complete starting points. Every section, colour and detail can be
          changed.
        </p>
        <div
          className="event-layout-catalogue"
          role="radiogroup"
          aria-label="Event layouts"
        >
          {eventLayouts.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected === item.id}
              tabIndex={selected === item.id ? 0 : -1}
              aria-label={item.name}
              onClick={() => setSelected(item.id)}
              onKeyDown={(event) => {
                const direction = ["ArrowRight", "ArrowDown"].includes(
                  event.key,
                )
                  ? 1
                  : ["ArrowLeft", "ArrowUp"].includes(event.key)
                    ? -1
                    : 0;
                if (!direction && event.key !== "Home" && event.key !== "End")
                  return;
                event.preventDefault();
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? eventLayouts.length - 1
                      : (eventLayouts.indexOf(item) +
                          direction +
                          eventLayouts.length) %
                        eventLayouts.length;
                setSelected(eventLayouts[index].id);
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    "button",
                  );
                buttons?.item(index)?.focus();
              }}
              style={
                {
                  "--layout-accent": item.primary,
                  "--layout-paper": item.background,
                } as CSSProperties
              }
            >
              <span
                className="event-layout-thumbnail"
                data-layout={item.layout}
                data-font={item.font}
                aria-hidden="true"
              >
                <span className="event-layout-hero">
                  <small>{item.badge}</small>
                  <strong>{item.name}</strong>
                  <i />
                </span>
                <span className="event-layout-samples">
                  {item.sections.slice(0, 3).map((section) => (
                    <span key={section}>{section}</span>
                  ))}
                </span>
                <span className="event-layout-mini-footer" />
              </span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
        <div className="event-layout-choice">
          <div>
            <strong>{layout.name}</strong>
            <p>
              {preserving
                ? "Your text, images and connections are kept. Missing sections are added as editable examples. Preview the result and undo if needed."
                : "Starts as a private draft with editable examples. Add your own images and choose published forms and directory profiles."}
            </p>
          </div>
          <button
            type="button"
            className="button button-accent"
            onClick={() => onSelect(selected)}
          >
            Use {layout.name}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
