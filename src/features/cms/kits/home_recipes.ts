import {
  block,
  document,
  photo,
  collection,
  events,
  invitation,
  gallery,
  calendar,
  directory,
  linkButton,
  type RecipeContext,
} from "./recipe_helpers";

export function homeRecipe(context: RecipeContext) {
  const action = context.kit === "rotaract-action";
  const intro = block("FeatureSection", {
    eyebrow: action ? "A place to belong" : "Service begins with connection",
    title: action
      ? "Find your people. Build something good."
      : "Local roots. A shared outlook.",
    body: "We bring different experiences to a common table. There is room for practical ideas, new friendships and small acts that make our community a better place.",
    assetId: photo(context, 1),
    alt: "Young plants growing in soil",
    imagePosition: "left",
    items: [],
    buttonLabel: context.links?.about ? "Meet the club" : "",
    buttonHref: context.links?.about ?? "",
  });
  const benefits = block("Cards", {
    items: [
      {
        title: "Make a difference",
        text: "Turn a shared idea into hands-on community service.",
        href: context.links?.projects ?? "",
        icon: "heart",
        linkLabel: "Explore our projects",
      },
      {
        title: "Make connections",
        text: "Meet people with different stories and a common willingness to contribute.",
        href: context.links?.events ?? "",
        icon: "people",
        linkLabel: "Find an activity",
      },
      {
        title: "Keep growing",
        text: "Learn by doing, share what you know and try something new.",
        href: context.links?.join || "/membership",
        icon: "spark",
        linkLabel: "Find your place",
      },
    ],
  });
  const hero = action
    ? block("Hero", {
        title: "Meet people. Make a difference.",
        body: "A little time. A shared idea. A community of people ready to take action with you.",
        buttonLabel: "Find your next activity",
        buttonHref: context.links?.events || "/events",
        assetId: photo(context, 0),
        imageAlt: "An inviting garden with raised beds and greenhouses",
        imagePosition: "right",
      })
    : block("HeroSlider", {
        label: "Our community",
        position: "left",
        items: [
          {
            title: "People taking action in our community.",
            body: "Connecting people, sharing ideas and putting service into practice. Discover a place to make a difference.",
            assetId: photo(context),
            alt: "Sunlit community growing spaces",
            buttonLabel: "Explore our projects",
            buttonHref: context.links?.projects ?? "",
            focalX: 50,
            focalY: 55,
          },
        ],
      });
  const schedule = calendar(context, "This month at the club");
  const calendarLink = context.links?.calendar
    ? [linkButton("Explore the calendar", context.links.calendar, true)]
    : [];
  return document(
    context,
    action
      ? [
          hero,
          events("Coming up next", 1),
          benefits,
          collection(context, "Ideas in action"),
          intro,
          ...schedule,
          ...calendarLink,
          directory("Stronger together", "partner"),
          gallery(context),
          invitation(context),
        ]
      : [
          hero,
          intro,
          collection(context, "Service in practice"),
          events("Come together"),
          benefits,
          ...schedule,
          ...calendarLink,
          directory("Stronger together", "partner"),
          invitation(context),
        ],
  );
}

export function projectsRecipe(context: RecipeContext) {
  const action = context.kit === "rotaract-action";
  return document(context, [
    block("PageIntro", {
      eyebrow: action ? "Ideas → action" : "Our service",
      title: action
        ? "Small starts. Shared possibilities."
        : "Projects with people at their heart.",
      introduction:
        "Explore the ideas, causes and collaborations that bring us together.",
      alignment: action ? "left" : "center",
    }),
    collection(context, "", "Projects will appear here."),
    block("FeatureSection", {
      eyebrow: "A shared effort",
      title: action
        ? "What could we do together?"
        : "A good idea can start with you.",
      body: "Have a local idea or a practical skill to share? We would love to hear from you.",
      assetId: photo(context, 2),
      alt: "Herbs growing in bamboo containers",
      imagePosition: action ? "right" : "left",
      items: [],
      buttonLabel: context.links?.contact ? "Start a conversation" : "",
      buttonHref: context.links?.contact ?? "",
    }),
  ]);
}
