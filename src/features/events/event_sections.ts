import type { Block, CmsData } from "../cms/cms_schemas";

/** Shared between the editor outline and published in-page navigation. */
export const eventSectionNames: Partial<Record<Block["type"], string>> = {
  EventHero: "Introduction",
  EventImpact: "Fundraising & impact",
  EventPractical: "Practical information",
  EventFooter: "Footer",
  Programme: "Programme",
  EventPackages: "Packages",
  EventPrizes: "Prizes",
  EventWinners: "Demonstration winners",
  ParticipationOptions: "Ways to take part",
  PartnerCollection: "Partners & Supporters",
  FAQ: "Questions",
  EventContact: "Contact",
  EventShare: "Share event",
  EventFlyer: "Flyer",
  Form: "Enquiry form",
  EventRegistration: "Registration",
  Gallery: "Gallery",
  ImageSlider: "Gallery",
  FeatureSection: "About the event",
};

export function eventSectionTitle(block: Block) {
  if ("title" in block.props && block.props.title.trim())
    return block.props.title;
  if (block.type === "Heading") return block.props.text || "Heading";
  if (block.type === "EventHero") return "Introduction";
  return (
    eventSectionNames[block.type] ??
    block.type.replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}

export function eventSectionAnchor(id: string) {
  return `event-section-${id}`;
}

export function eventPageNavigation(data: CmsData) {
  const hidden = new Set(data.root.props.eventHiddenSections ?? []);
  return data.content
    .filter(
      (block) =>
        !hidden.has(block.props.id) &&
        ![
          "EventHero",
          "EventFooter",
          "Spacer",
          "Divider",
          "Button",
          "Image",
          "RichText",
        ].includes(block.type),
    )
    .map((block) => ({
      label: eventSectionTitle(block),
      href: `#${encodeURIComponent(eventSectionAnchor(block.props.id))}`,
    }));
}
