import type { CmsData } from "../cms_schemas";
import type { PublicEventCard } from "../../events/event_catalogue";

// Illustrative records are passed only to an authorized kit preview. No event
// rows, registrations, module settings, payment states or provider IDs are made.
export const demoProjects = [
  {
    title: "The neighbourhood garden",
    description: "A shared space to grow, learn and spend time together.",
  },
  {
    title: "The seedling exchange",
    description:
      "A simple invitation to share growing ideas and new beginnings.",
  },
  {
    title: "A little herb corner",
    description:
      "Exploring how a small green space can bring neighbours together.",
  },
];
export function demoProject(data: CmsData, index: number) {
  const copy = structuredClone(data);
  const title = copy.content.find((block) => block.type === "PageIntro");
  if (title?.type === "PageIntro") {
    title.props.title = demoProjects[index].title;
    title.props.introduction = demoProjects[index].description;
  }
  return copy;
}
export function demoEvents(
  hrefs: string[],
  assets: string[],
): PublicEventCard[] {
  return [
    {
      id: "demo-open-afternoon",
      title: "Garden open afternoon",
      description: "Meet the group, explore a growing space and share an idea.",
      startsAt: "2030-05-18T13:00:00Z",
      imageId: assets[0] ?? null,
    },
    {
      id: "demo-ideas-table",
      title: "The ideas table",
      description: "An informal conversation about what we could do together.",
      startsAt: "2030-06-08T15:00:00Z",
      imageId: assets[1] ?? null,
    },
  ]
    .slice(0, hrefs.length)
    .map((item, index) => ({
      ...item,
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Example community garden",
      cancelled: false,
      href: hrefs[index],
    }));
}

export function demoEventPage(data: CmsData, index: number) {
  const copy = structuredClone(data);
  const intro = copy.content.find((block) => block.type === "PageIntro");
  if (intro?.type === "PageIntro")
    intro.props.title = index ? "The ideas table" : "Garden open afternoon";
  return copy;
}
