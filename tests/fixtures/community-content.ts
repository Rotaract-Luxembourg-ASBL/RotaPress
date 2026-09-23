import type { CmsData } from "../../src/features/cms/cms_schemas";

/** Explicitly synthetic local acceptance content; no reference-site assets or data. */
export function communityContent(assetId: string): CmsData {
  return {
    root: { props: {} },
    content: [
      {
        type: "HeroSlider",
        props: {
          id: "story",
          version: 1,
          label: "Community stories",
          position: "left",
          items: [
            {
              title: "Good people. Shared purpose.",
              body: "A synthetic local demonstration of the community website components.",
              assetId,
              alt: "Synthetic community artwork",
              buttonLabel: "Discover our events",
              buttonHref: "/events",
            },
            {
              title: "Small actions. Shared impact.",
              body: "A second editable story. Choose your own club photographs and messages.",
              assetId,
              alt: "Synthetic community artwork",
              buttonLabel: "Get involved",
              buttonHref: "/membership",
            },
          ],
        },
      },
      {
        type: "Cards",
        props: {
          id: "activities",
          version: 1,
          items: [
            {
              title: "Support a cause",
              text: "Present your community projects with a clear next step.",
              href: "/events",
              icon: "heart",
              linkLabel: "Explore events",
            },
            {
              title: "Volunteer together",
              text: "Invite people to bring their skills and ideas.",
              href: "/membership",
              icon: "people",
              linkLabel: "Join the community",
            },
            {
              title: "Build connections",
              text: "Make room for shared experiences and lasting friendships.",
              href: "/events",
              icon: "globe",
              linkLabel: "Meet at an event",
            },
          ],
        },
      },
      {
        type: "FeatureSection",
        props: {
          id: "benefits",
          version: 1,
          eyebrow: "Your community",
          title: "A place to belong",
          body: "Flexible sections bring together your own images, content and calls to action.",
          assetId,
          alt: "Synthetic community artwork",
          imagePosition: "left",
          items: [
            {
              title: "Make meaningful connections",
              text: "Meet people who share your interests.",
              icon: "people",
            },
            {
              title: "Put your ideas into action",
              text: "Introduce the ways members contribute.",
              icon: "spark",
            },
          ],
          buttonLabel: "Become a member",
          buttonHref: "/membership",
        },
      },
      {
        type: "Programme",
        props: {
          id: "programme",
          version: 1,
          title: "Our evening together",
          introduction: "Synthetic programme for local acceptance only.",
          items: [
            {
              time: "18:00",
              title: "Welcome & connections",
              description: "An informal start to the evening.",
            },
            {
              time: "18:30",
              title: "Ideas into action",
              description: "Share ideas and meet the community.",
            },
            {
              time: "20:00",
              title: "The next chapter",
              description: "Continue the conversation.",
            },
          ],
        },
      },
      {
        type: "ParticipationOptions",
        props: {
          id: "participation",
          version: 1,
          title: "Find your way to take part",
          introduction:
            "Information cards link to existing registration or membership pages.",
          items: [
            {
              title: "Come along",
              priceLabel: "",
              description: "Explore the published event details.",
              features: [{ text: "Programme and venue information" }],
              badge: "",
              buttonLabel: "View events",
              buttonHref: "/events",
            },
            {
              title: "Get involved",
              priceLabel: "",
              description: "Start a conversation about membership.",
              features: [{ text: "Verified application and club review" }],
              badge: "",
              buttonLabel: "Apply to join",
              buttonHref: "/membership",
            },
          ],
          design: { columns: "two", tone: "soft", spacing: "comfortable" },
        },
      },
      {
        type: "EventCollection",
        props: {
          id: "events",
          version: 1,
          title: "Coming together",
          introduction: "Published events, kept up to date from Events.",
          period: "all",
          limit: 6,
          layout: "cards",
        },
      },
      {
        type: "FAQ",
        props: {
          id: "faq",
          version: 1,
          items: [
            {
              question: "How do I take part?",
              answer:
                "Open an event to see its published programme and available registration options.",
            },
          ],
        },
      },
    ],
  };
}
