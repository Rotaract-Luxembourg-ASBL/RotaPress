import { z } from "zod";
import { emptyCmsData, type CmsData } from "./cms_schemas";
import { copyCommunityTemplate } from "./community_template";
import { kitIdSchema, recipeIdSchema } from "./kits/catalogue";
import { copyKitRecipe } from "./kits/recipes";
import { referenceEventPage } from "../events/event_page_template";
import { eventLayoutIdSchema } from "../events/event_layouts";
import { eventLayoutRecipe } from "../events/event_layout_recipes";

// Copy-only content recipes. Theme IDs, permissions and event feature settings
// are deliberately absent. Existing pages have no live link to this catalogue.
export const pageTemplateIdSchema = z.union([
  z.templateLiteral(["event-layout:", eventLayoutIdSchema]),
  z.enum([
    "blank",
    "event-reference",
    "home",
    "community",
    "about",
    "projects",
    "events",
    "join",
    "contact",
  ]),
  z.templateLiteral([
    kitIdSchema,
    ":",
    recipeIdSchema.exclude(["header", "footer"]),
  ]),
]);
export type PageTemplateId = z.infer<typeof pageTemplateIdSchema>;

export const starterPages = [
  {
    title: "Home",
    slug: "home",
    heading: "Good people. Shared purpose.",
    body: "Welcome to our community. This starter website is yours to shape.",
    detail:
      "<h2>A place to belong</h2><p>Bring your ideas, meet people, and make a difference together. Replace this starter introduction with your club's story.</p>",
  },
  {
    title: "About",
    slug: "about",
    heading: "A little about us.",
    body: "Our club brings people together around a shared purpose.",
    detail:
      "<h2>Our story</h2><p>Introduce your club, its values, and the people who make it possible. This is editable starter content.</p>",
  },
  {
    title: "Projects",
    slug: "projects",
    heading: "Good ideas become shared projects.",
    body: "A space to introduce the work your community takes on.",
    detail:
      "<h2>What we are working on</h2><p>Add your first real project here. No project statistics or completed work are implied by this starter page.</p>",
  },
  {
    title: "Events",
    slug: "events",
    heading: "Make time for community.",
    body: "Meetings, gatherings, and moments to connect.",
    detail:
      "<h2>Coming together</h2><p>Explore our published events. Each event page has its own programme, practical details and available registration options.</p>",
  },
  {
    title: "Join",
    slug: "join",
    heading: "There is a place for you here.",
    body: "Verify your email and apply to join. Your club reviews every membership application.",
    detail:
      "<h2>Start with a conversation</h2><p>Tell your community what membership means and what new members can expect.</p>",
  },
  {
    title: "Contact",
    slug: "contact",
    heading: "Let us start a conversation.",
    body: "Add your club's contact details here when you are ready to share them.",
    detail:
      "<h2>Get in touch</h2><p>Add a published Contact form using the Form block to receive messages. This starter text does not collect a message.</p>",
  },
];

export function copyPageTemplate(id: PageTemplateId): CmsData {
  if (id.startsWith("event-layout:"))
    return eventLayoutRecipe(
      eventLayoutIdSchema.parse(id.slice("event-layout:".length)),
    );
  if (id === "event-reference") return referenceEventPage();
  if (id.includes(":")) {
    const [kit, recipe] = id.split(":");
    return copyKitRecipe(recipeIdSchema.parse(recipe), {
      kit: kitIdSchema.parse(kit),
    });
  }
  if (id === "blank") return structuredClone(emptyCmsData);
  if (id === "community") return copyCommunityTemplate();
  const starter = starterPages.find((item) => item.slug === id);
  if (!starter) throw new Error("Unknown built-in page template.");
  const data: CmsData = {
    root: { props: {} },
    content: [
      {
        type: "Hero",
        props: {
          id: crypto.randomUUID(),
          version: 1,
          title: starter.heading,
          body: starter.body,
          buttonLabel: "Become a member",
          buttonHref: "/membership",
        },
      },
      {
        type: "RichText",
        props: { id: crypto.randomUUID(), version: 1, text: starter.detail },
      },
    ],
  };
  if (starter.slug === "home") {
    data.content.push(
      {
        type: "Cards",
        props: {
          id: crypto.randomUUID(),
          version: 1,
          items: [
            {
              title: "Meet the club",
              text: "Introduce the people and purpose behind your community. This is editable example content.",
              href: "/pages/en/about",
            },
            {
              title: "Make something together",
              text: "Use your Projects page to share real work when you are ready.",
              href: "/pages/en/projects",
            },
            {
              title: "Find your place",
              text: "Learn about membership and send an application for the club to review.",
              href: "/membership",
            },
          ],
        },
      },
      {
        type: "CallToAction",
        props: {
          id: crypto.randomUUID(),
          version: 1,
          title: "It starts with a conversation.",
          text: "A synthetic starter for your club's invitation. Replace this copy with your own welcome.",
          label: "Apply to join",
          href: "/membership",
        },
      },
    );
  }
  if (starter.slug === "events") {
    data.content.push({
      type: "EventCollection",
      props: {
        id: crypto.randomUUID(),
        version: 1,
        title: "Upcoming events",
        introduction: "",
        period: "upcoming",
        limit: 12,
        layout: "cards",
      },
    });
  }
  return data;
}
