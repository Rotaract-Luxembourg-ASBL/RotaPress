import type { Block, CmsData } from "../cms/cms_schemas";
import { referenceEventPage } from "./event_page_template";
import { eventLayout, type EventLayoutId } from "./event_layouts";

function directory(id: string, category: "team" | "sponsor"): Block {
  return {
    type: "PartnerCollection",
    props: {
      id: `event-${id}`,
      version: 1,
      title: category === "team" ? "Meet the team" : "Our sponsors",
      partnerIds: [],
      selectionMode: "selected",
      category,
      presentation: category === "team" ? "cards" : "logos",
    },
  };
}

/** Editable examples. Directory sections start unbound; editors choose actual published profiles. */
export function eventLayoutRecipe(id: EventLayoutId): CmsData {
  const layout = eventLayout(id);
  const base = referenceEventPage();
  const blocks = new Map(
    base.content.map((block) => [block.props.id.replace("event-", ""), block]),
  );
  blocks.set("story", {
    type: "RichText",
    props: {
      id: "event-story",
      version: 1,
      text: `<h2>${id === "workshop" ? "What you will learn" : "A moment with a purpose"}</h2><p>Tell visitors what makes this event special, who it is for and what they can look forward to. Replace this example with your own story.</p>`,
    },
  });
  blocks.set("gallery", {
    type: "Gallery",
    props: { id: "event-gallery", version: 1, items: [], columns: "three" },
  });
  blocks.set("team", directory("team", "team"));
  blocks.set("sponsors", directory("sponsors", "sponsor"));
  const hero = blocks.get("introduction")!;
  if (hero.type === "EventHero")
    Object.assign(hero.props, {
      badge: layout.badge,
      tagline: layout.tagline,
      layout: layout.layout,
      height: layout.height,
    });
  const programme = blocks.get("programme")!;
  if (programme.type === "Programme")
    programme.props.items = [
      {
        time: "Arrival",
        title: "A warm welcome",
        description: "Introduce how guests will arrive and meet the team.",
      },
      {
        time: "Main session",
        title: "The shared experience",
        description: "Describe the main activity and what guests can expect.",
      },
      {
        time: "Closing",
        title: "Keep the conversation going",
        description: "Add your closing activity and next steps.",
      },
    ];
  const faq = blocks.get("faq")!;
  if (faq.type === "FAQ")
    faq.props.items = [
      {
        question: "Who is this event for?",
        answer:
          "Replace this example with your audience and any attendance requirements.",
      },
      {
        question: "What should I bring?",
        answer:
          "Add the practical details your guests need before they arrive.",
      },
    ];
  return {
    root: {
      props: {
        ...base.root.props,
        eventDesign: {
          ...base.root.props.eventDesign!,
          primaryColor: layout.primary,
          backgroundColor: layout.background,
          font: layout.font,
          spacing: layout.spacing,
          corners: layout.corners,
        },
      },
    },
    content: [
      hero,
      ...layout.sections.map((key) => blocks.get(key)!),
      blocks.get("footer")!,
    ],
  };
}

/** Changing style keeps authored sections and connections; Undo restores the prior document. */
export function mergeEventLayout(data: CmsData, id: EventLayoutId): CmsData {
  const recipe = eventLayoutRecipe(id);
  const remaining = [...data.content];
  const content = recipe.content.map((example) => {
    const index = remaining.findIndex(
      (block) =>
        block.type === example.type &&
        (block.type !== "PartnerCollection" ||
          example.type !== "PartnerCollection" ||
          (block.props.category ?? "all") ===
            (example.props.category ?? "all")),
    );
    if (index < 0)
      return {
        ...example,
        props: { ...example.props, id: crypto.randomUUID() },
      } as Block;
    const existing = remaining.splice(index, 1)[0];
    if (existing.type === "EventHero" && example.type === "EventHero")
      return {
        ...existing,
        props: {
          ...existing.props,
          layout: example.props.layout,
          height: example.props.height,
        },
      };
    return existing;
  });
  const footer = content.findIndex((block) => block.type === "EventFooter");
  content.splice(footer < 0 ? content.length : footer, 0, ...remaining);
  const programme = content.find((block) => block.type === "Programme");
  for (const block of content) {
    if (
      block.type === "EventHero" &&
      block.props.buttonHref === "#event-section-event-programme" &&
      programme
    )
      block.props.buttonHref = `#event-section-${programme.props.id}`;
  }
  return {
    ...data,
    content,
    root: {
      props: {
        ...data.root.props,
        ...recipe.root.props,
        eventHiddenSections: [
          ...new Set([
            ...(data.root.props.eventHiddenSections ?? []),
            ...data.content
              .filter((block) =>
                ["Hero", "HeroSlider", "PageIntro"].includes(block.type),
              )
              .map((block) => block.props.id),
          ]),
        ],
      },
    },
  };
}
