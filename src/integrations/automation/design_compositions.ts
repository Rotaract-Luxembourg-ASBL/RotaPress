import { z } from "zod";
import { cmsDataSchema, type CmsData } from "@/features/cms/cms_schemas";

export const compositionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  contexts: z.array(z.string()),
  purpose: z.string(),
  adaptation: z.array(z.string()),
  // The native schema is already supplied by website_design.dataSchema.
  // Avoid repeating the large block union in this operation's output schema.
  exampleDocument: z.record(z.string(), z.unknown()),
});
export const blockGuidanceSchema = z.strictObject({
  sourcePattern: z.string(),
  blockTypes: z.array(z.string()),
  guidance: z.string(),
});

const compositions: {
  id: string;
  name: string;
  contexts: string[];
  purpose: string;
  adaptation: string[];
  exampleDocument: CmsData;
}[] = [
  {
    id: "photo-story-home",
    name: "Image-led club homepage",
    contexts: ["page"],
    purpose:
      "Compose a prominent welcome, image-and-text story, ways to help and one closing invitation.",
    adaptation: [
      "Replace all example text with verified source facts and requested links. Preserve the source section order instead of turning the whole page into RichText.",
      "Set Hero.assetId/imageAlt and FeatureSection.assetId/alt to actual inspected media. Empty image IDs in this example are placeholders, not imported photographs.",
      "Hero is a split introduction; use Cover for text over a background image or HeroSlider for a manual sequence. Choose the pattern that matches the observed reference.",
      "Use design.tone and spacing to separate sections. The existing website theme supplies colors, typography and responsive behavior.",
    ],
    exampleDocument: {
      root: { props: {} },
      content: [
        {
          type: "Hero",
          props: {
            id: "welcome",
            version: 1,
            title: "Replace with your club's main invitation",
            body: "Replace with a short verified introduction.",
            buttonLabel: "",
            buttonHref: "",
            assetId: "",
            imageAlt: "",
            imagePosition: "right",
            design: { spacing: "spacious", width: "full" },
          },
        },
        {
          type: "FeatureSection",
          props: {
            id: "club-story",
            version: 1,
            eyebrow: "",
            title: "Replace with the next section heading",
            body: "Replace with the source's story, adapted to verified club facts.",
            assetId: "",
            alt: "",
            imagePosition: "left",
            items: [],
            buttonLabel: "",
            buttonHref: "",
            design: { tone: "soft", spacing: "comfortable" },
          },
        },
        {
          type: "Cards",
          props: {
            id: "ways-to-help",
            version: 1,
            design: { columns: "three", corners: "soft" },
            items: [
              {
                title: "Replace with one way to help",
                text: "Add verified details.",
                href: "",
                icon: "heart",
                linkLabel: "",
              },
              {
                title: "Replace with another way to help",
                text: "Add verified details.",
                href: "",
                icon: "people",
                linkLabel: "",
              },
              {
                title: "Replace with a third way to help",
                text: "Add verified details.",
                href: "",
                icon: "spark",
                linkLabel: "",
              },
            ],
          },
        },
        {
          type: "CallToAction",
          props: {
            id: "next-step",
            version: 1,
            title: "Replace with the closing invitation",
            text: "Explain the visitor's next step.",
            label: "",
            href: "",
            design: {
              tone: "dark",
              spacing: "comfortable",
              alignment: "center",
            },
          },
        },
      ],
    },
  },
  {
    id: "editorial-image-story",
    name: "Story with a photograph beside the text",
    contexts: ["page"],
    purpose:
      "Use actual layout slots for a text-and-image section that stacks on a phone.",
    adaptation: [
      "Keep left/right arrays inside Columns.props. Never invent Puck zones or nest another Columns block.",
      "Replace the image placeholder with an actual media ID and useful alt text. Set focalX/focalY, fit and aspectRatio after inspecting the image.",
      "Use balanced, wide-left or wide-right ratio to fit the observed content. Preview the saved page on desktop and phone.",
    ],
    exampleDocument: {
      root: { props: {} },
      content: [
        {
          type: "PageIntro",
          props: {
            id: "introduction",
            version: 1,
            eyebrow: "",
            title: "Replace with the page title",
            introduction: "Add a short verified summary.",
            alignment: "left",
          },
        },
        {
          type: "Columns",
          props: {
            id: "story-and-photo",
            version: 1,
            ratio: "wide-left",
            design: { spacing: "comfortable", width: "full" },
            left: [
              {
                type: "Heading",
                props: {
                  id: "story-heading",
                  version: 1,
                  text: "Replace with the section heading",
                  level: "h2",
                },
              },
              {
                type: "RichText",
                props: {
                  id: "story-text",
                  version: 1,
                  text: "<p>Replace with verified source paragraphs.</p>",
                },
              },
            ],
            right: [
              {
                type: "Image",
                props: {
                  id: "story-image",
                  version: 1,
                  assetId: "",
                  alt: "",
                  caption: "",
                  width: "full",
                  fit: "cover",
                  aspectRatio: "landscape",
                  focalX: 50,
                  focalY: 50,
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: "shared-header",
    name: "Shared club header with connected navigation",
    contexts: ["header"],
    purpose:
      "Keep club identity and navigation in a shared header rather than duplicating them inside every page.",
    adaptation: [
      "Inspect and preserve the existing shared header before saving. SiteMenu reads the primary menu in website_context; it does not create links or publish menus.",
      "SiteBrand inherits the shared website branding when assetId and label are empty. Change branding or menu drafts only when requested and separately granted.",
      "All SiteRow children must be allowed in the header context. Keep Site blocks out of page documents.",
    ],
    exampleDocument: {
      root: { props: {} },
      content: [
        {
          type: "SiteRow",
          props: {
            id: "shared-navigation",
            version: 1,
            layout: "wide-right",
            flow: "row",
            spacing: "compact",
            left: [
              {
                type: "SiteBrand",
                props: {
                  id: "club-brand",
                  version: 1,
                  assetId: "",
                  alt: "",
                  label: "",
                  logoSize: "medium",
                  showName: true,
                },
              },
            ],
            center: [],
            right: [
              {
                type: "SiteMenu",
                props: {
                  id: "primary-menu",
                  version: 1,
                  menuKey: "primary",
                  label: "Primary navigation",
                  layout: "horizontal",
                },
              },
            ],
          },
        },
      ],
    },
  },
];

export function designCompositions() {
  return compositions.map((composition) => {
    const example = structuredClone(composition);
    return {
      ...example,
      exampleDocument: cmsDataSchema.parse(example.exampleDocument),
    };
  });
}

export const blockGuidance = [
  {
    sourcePattern: "Large welcome or image banner",
    blockTypes: ["Hero", "Cover", "HeroSlider"],
    guidance:
      "Hero pairs text and an optional image; Cover places text over a background; HeroSlider combines several manually controlled image-and-text slides. Match the source's actual structure.",
  },
  {
    sourcePattern: "Alternating photograph and text sections",
    blockTypes: ["FeatureSection", "Columns", "Image", "RichText"],
    guidance:
      "FeatureSection provides an image side, copy, benefits and button. Columns provides independent left/right leaf-block arrays. Alternate imagePosition deliberately; preserve content order and image crops.",
  },
  {
    sourcePattern: "Ways to help, benefits or service cards",
    blockTypes: ["Cards", "CallToAction"],
    guidance:
      "Use Cards for parallel items, with real labels and links. Use CallToAction for one focused invitation. Manual cards do not create registrations, payments or volunteering records.",
  },
  {
    sourcePattern: "Photograph grid or image sequence",
    blockTypes: ["Gallery", "ImageSlider"],
    guidance:
      "Use Gallery for visible grids and ImageSlider for manual browsing. Use inspected real media IDs, alt text, aspect ratio and columns. External source URLs cannot be block asset IDs.",
  },
  {
    sourcePattern: "Published stories, events and partners",
    blockTypes: [
      "ProjectCollection",
      "EventCollection",
      "PartnerCollection",
      "PageCollection",
    ],
    guidance:
      "Use connected collections for records that exist in their owning workspace. Discover enabled features and published sources first; retain existing sources and never fabricate IDs, outcomes or live content.",
  },
  {
    sourcePattern: "Contact, membership or activity schedule",
    blockTypes: ["Form", "Calendar", "ClubDetails"],
    guidance:
      "Read actual source records and public club identity. A source link or drawn form cannot create a working form/calendar. Keep source publication, audience and operational settings separate from page design.",
  },
  {
    sourcePattern: "Shared navigation and footer",
    blockTypes: [
      "SiteRow",
      "SiteBrand",
      "SiteMenu",
      "SiteContact",
      "SiteSocial",
      "SiteFooterText",
    ],
    guidance:
      "Use the header/footer contexts and existing site settings. Page drafts, shared parts, menus and appearance have separate saved and published state.",
  },
] as const;
