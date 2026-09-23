"use client";
import { useState } from "react";
import type { Block } from "@/features/cms/cms_schemas";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { sectionLabel } from "./event-section-fields";

const groups: { label: string; types: Block["type"][] }[] = [
  {
    label: "The event experience",
    types: [
      "EventHero",
      "Programme",
      "Calendar",
      "EventImpact",
      "EventPractical",
      "FAQ",
      "PartnerCollection",
      "EventContact",
      "EventShare",
      "EventFlyer",
      "EventFooter",
    ],
  },
  {
    label: "Booking & participation",
    types: [
      "EventPackages",
      "EventPrizes",
      "EventWinners",
      "EventRegistration",
      "Form",
      "ParticipationOptions",
    ],
  },
  {
    label: "Images & storytelling",
    types: [
      "Hero",
      "HeroSlider",
      "PageIntro",
      "FeatureSection",
      "Gallery",
      "ImageSlider",
      "Image",
      "Cards",
      "Team",
      "Cover",
      "Sponsors",
      "EventCollection",
    ],
  },
  {
    label: "Simple content",
    types: [
      "Heading",
      "RichText",
      "Button",
      "CallToAction",
      "Divider",
      "Spacer",
    ],
  },
];
const descriptions: Partial<Record<Block["type"], string>> = {
  Calendar: "Combine calendars, repeating schedules and published events.",
  EventHero: "Artwork, event name, date, invitation and countdown.",
  Programme: "An ordered schedule of activities and times.",
  EventImpact: "Explain your cause, goals and how people can help.",
  EventPractical: "Event date, location, directions and useful details.",
  EventFooter: "A closing message, section links and social profiles.",
  PartnerCollection:
    "Choose published partners and sponsors from your directory.",
  EventPackages: "Show offers managed in Packages, with their booking links.",
  EventPrizes: "Show the published collection managed in Prizes.",
  EventWinners:
    "Show approved demonstration names from Prizes → Draws & winners.",
  EventRegistration: "Your event's registration, directly on this page.",
  Form: "Choose an event enquiry or feedback form.",
  FAQ: "Questions visitors can open to read the answers.",
  EventContact: "Contact information for your organizers.",
  EventShare: "Share the published event address.",
  EventFlyer: "A flyer selected from your public images.",
};

export function EventSectionLibrary({
  available,
  add,
  onClose,
  applyLayout,
}: {
  available: Block["type"][];
  add: (type: Block["type"], category?: "partner" | "sponsor" | "team") => void;
  onClose: () => void;
  applyLayout?: () => void;
}) {
  const [query, setQuery] = useState("");
  const matching = available.filter((type) =>
    `${sectionLabel(type)} ${descriptions[type] ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Dialog title="Add a section" onClose={onClose}>
      <div className="event-library">
        <p>
          Choose a section, then make it yours. You can move or hide it at any
          time.
        </p>
        <label>
          Find a section
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Programme, photos, registration…"
          />
        </label>
        {applyLayout && !query && (
          <div className="event-layout-start">
            <div>
              <strong>Start with a complete event layout</strong>
              <p>
                Ten editable examples for galas, conferences, workshops and
                more. Existing content is kept.
              </p>
            </div>
            <button
              type="button"
              className="button button-outline"
              onClick={applyLayout}
            >
              Browse event layouts
            </button>
          </div>
        )}
        {groups.map((group) => {
          const types = group.types.filter((type) => matching.includes(type));
          return (
            types.length > 0 && (
              <section key={group.label}>
                <h3>{group.label}</h3>
                <div className="event-library-grid">
                  {types.map((type) =>
                    type === "PartnerCollection" ? (
                      (
                        [
                          ["partner", "Partners"],
                          ["sponsor", "Sponsors"],
                          ["team", "Team"],
                        ] as const
                      ).map(([category, label]) => (
                        <button
                          key={category}
                          type="button"
                          aria-label={`Add ${label} from directory`}
                          onClick={() => add(type, category)}
                        >
                          <span className="event-library-icon">
                            <Icon name="members" />
                          </span>
                          <span>
                            <strong>{label}</strong>
                            <small>
                              Choose published profiles, or keep a category in
                              sync automatically.
                            </small>
                          </span>
                          <Icon name="plus" />
                        </button>
                      ))
                    ) : (
                      <button
                        key={type}
                        type="button"
                        aria-label={`Add ${sectionLabel(type)}`}
                        onClick={() => add(type)}
                      >
                        <span className="event-library-icon">
                          <Icon
                            name={
                              type.includes("Image") || type === "Gallery"
                                ? "image"
                                : type === "Form"
                                  ? "forms"
                                  : "website"
                            }
                          />
                        </span>
                        <span>
                          <strong>{sectionLabel(type)}</strong>
                          <small>
                            {descriptions[type] ??
                              "Add and customize this section."}
                          </small>
                        </span>
                        <Icon name="plus" />
                      </button>
                    ),
                  )}
                </div>
              </section>
            )
          );
        })}
        {!matching.length && <p>No sections match that search.</p>}
        <p className="field-help">
          Registration, forms and prizes appear here when their event features
          are enabled.
        </p>
      </div>
    </Dialog>
  );
}
