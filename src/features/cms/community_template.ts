import type { CmsData } from "./cms_schemas";

/** An editable starting copy, with no live link to the recipe or a theme. */
export function copyCommunityTemplate(): CmsData {
  const base = () => ({ id: crypto.randomUUID(), version: 1 as const });
  return {
    root: { props: {} },
    content: [
      {
        type: "HeroSlider",
        props: {
          ...base(),
          label: "Club stories",
          position: "left",
          items: [
            {
              title: "People. Purpose. Possibility.",
              body: "Replace this introduction with your club's story and choose a photograph from your media library.",
              assetId: "",
              alt: "",
              buttonLabel: "Get involved",
              buttonHref: "/membership",
            },
          ],
        },
      },
      {
        type: "Cards",
        props: {
          ...base(),
          items: [
            {
              title: "Support a cause",
              text: "Introduce the causes your club supports.",
              href: "",
              icon: "heart",
            },
            {
              title: "Volunteer together",
              text: "Explain how people can contribute their time.",
              href: "",
              icon: "people",
            },
            {
              title: "Create lasting change",
              text: "Share your community's projects.",
              href: "",
              icon: "globe",
            },
          ],
        },
      },
      {
        type: "FeatureSection",
        props: {
          ...base(),
          eyebrow: "Our community",
          title: "Find your place",
          body: "Add your club's membership benefits and an image. This is an editable starting copy.",
          assetId: "",
          alt: "",
          imagePosition: "left",
          items: [],
          buttonLabel: "Become a member",
          buttonHref: "/membership",
        },
      },
      {
        type: "EventCollection",
        props: {
          ...base(),
          title: "Coming together",
          introduction: "",
          period: "upcoming",
          limit: 3,
          layout: "cards",
        },
      },
      {
        type: "PartnerCollection",
        props: {
          ...base(),
          title: "Our supporters",
          partnerIds: [],
          presentation: "logos",
        },
      },
      {
        type: "CallToAction",
        props: {
          ...base(),
          title: "It starts with a conversation",
          text: "Write your invitation to the community here.",
          label: "Get involved",
          href: "/membership",
        },
      },
    ],
  };
}
