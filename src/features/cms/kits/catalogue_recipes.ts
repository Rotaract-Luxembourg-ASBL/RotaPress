import type { RecipeId } from "./catalogue";
import {
  block,
  document,
  intro,
  photo,
  text,
  heading,
  gallery,
  invitation,
  collection,
  events,
  calendar,
  directory,
  linkButton,
  type RecipeContext,
} from "./recipe_helpers";

export function catalogueRecipe(
  id: Exclude<RecipeId, "home" | "projects" | "header" | "footer">,
  context: RecipeContext,
) {
  const action = context.kit === "rotaract-action";
  const image = (index: number, caption = "") =>
    photo(context, index)
      ? [
          block("Image", {
            assetId: photo(context, index),
            alt: [
              "Garden with growing beds",
              "Young plants growing in soil",
              "Herbs in bamboo containers",
            ][index % 3],
            caption,
            aspectRatio: "wide",
            corners: "soft",
          }),
        ]
      : [];
  const story = (title: string, body: string) =>
    block("FeatureSection", {
      eyebrow: "Our story",
      title,
      body,
      assetId: photo(context, 1),
      alt: "Young plants growing in soil",
      imagePosition: action ? "right" : "left",
      items: [],
      buttonLabel: "",
      buttonHref: "",
    });
  const contactAction = block("CallToAction", {
    title: "Have an idea to share?",
    text: "A conversation is a good place to begin.",
    label: context.links?.contact ? "Talk with us" : "",
    href: context.links?.contact ?? "",
  });
  switch (id) {
    case "about":
      return document(context, [
        intro(
          action
            ? "Different stories. Common ground."
            : "Connected by a spirit of service.",
          "A club is a place to bring your experience, listen to others and turn shared interests into action.",
          "Meet the club",
          !action,
        ),
        story(
          "People make the difference.",
          "We value curiosity, consideration and practical involvement. Getting to know each other is part of discovering what we can do together.",
        ),
        block("Cards", {
          items: [
            {
              title: "Service",
              text: "Understand a need and work with others to respond.",
              href: "",
              icon: "heart",
            },
            {
              title: "Connection",
              text: "Make space for different perspectives and new friendships.",
              href: "",
              icon: "people",
            },
            {
              title: "Learning",
              text: "Share experience and learn through participation.",
              href: "",
              icon: "spark",
            },
          ],
        }),
        text(
          "<h2>Our story, in our own words</h2><p>We believe that community grows through the time people give to one another. Our story continues with every conversation and every shared idea.</p>",
        ),
        ...(context.links?.team
          ? [linkButton("Meet our team", context.links.team, true)]
          : []),
        invitation(context),
      ]);
    case "project-detail":
      return document(context, [
        intro(
          context.demo ? "The neighbourhood garden" : "A shared project",
          "A place to grow, learn and spend time together.",
          "Community · Project story",
          !action,
        ),
        ...image(0),
        text(
          "<h2>The idea</h2><p>Bring neighbours together around growing things. A garden can create space to share practical knowledge and make new connections.</p><h2>What matters</h2><p>Listen to the people who use the space, start with achievable steps and learn from each other along the way.</p>",
        ),
        block("Programme", {
          title: "From idea to participation",
          introduction: "A starting outline for a shared community project.",
          items: [
            {
              time: "Listen",
              title: "Understand the need",
              description:
                "Talk together about what a shared growing space could offer.",
            },
            {
              time: "Plan",
              title: "Start at a manageable scale",
              description:
                "Agree the next practical step and the help it needs.",
            },
            {
              time: "Take part",
              title: "Share the experience",
              description:
                "Make room for learning and adjust the idea together.",
            },
          ],
        }),
        gallery(context),
        contactAction,
      ]);
    case "events":
      return document(context, [
        intro(
          action
            ? "Make time for good company."
            : "Come together. Get involved.",
          "Find an opportunity to meet the club and take part.",
          "Events & activities",
          !action,
        ),
        events("Upcoming activities", 12),
        ...(context.links?.calendar
          ? [
              linkButton(
                "See the community calendar",
                context.links.calendar,
                true,
              ),
            ]
          : []),
        block("EventCollection", {
          title: "Past activities",
          introduction: "",
          period: "past",
          limit: 6,
          layout: "list",
        }),
        contactAction,
      ]);
    case "calendar":
      return document(context, [
        intro(
          action
            ? "Make time for what matters."
            : "Your community, on the calendar.",
          "Explore club activities and find a time to join us. Open an activity for details and available booking options.",
          "Calendar",
          !action,
        ),
        ...calendar(context, "What's on", "month"),
        block("Cards", {
          items: [
            {
              title: "Explore our events",
              text: "Read the programme, practical information and registration options for each event.",
              href: context.links?.events ?? "/events",
              linkLabel: "Browse events",
              icon: "people",
            },
            {
              title: "Keep in touch",
              text: "Choose your calendar updates and reminders from your account.",
              href: "/calendar?tab=subscriptions",
              linkLabel: "Calendar subscriptions",
              icon: "heart",
            },
          ],
        }),
        contactAction,
      ]);
    case "team":
      return document(context, [
        intro(
          action
            ? "The people behind the ideas."
            : "Meet the people who bring us together.",
          "Different experiences, a shared purpose and a willingness to contribute.",
          "Our team",
          !action,
        ),
        directory("Meet our team", "team"),
        invitation(context),
        contactAction,
      ]);
    case "event-detail":
      return document(context, [
        intro(
          context.demo ? "Garden open afternoon" : "An invitation to take part",
          "Meet, exchange ideas and enjoy time together.",
          "Club activity",
          !action,
        ),
        ...image(0),
        block("Programme", {
          title: "What to expect",
          introduction:
            "A relaxed introduction to the club and its shared interests.",
          items: [
            {
              time: "Welcome",
              title: "Meet the group",
              description: "Say hello and get to know the people around you.",
            },
            {
              time: "Discover",
              title: "Explore an idea together",
              description:
                "Ask questions, share an experience and find out more.",
            },
            {
              time: "Connect",
              title: "Keep the conversation going",
              description: "Discover ways to take part in a future activity.",
            },
          ],
        }),
        block("FAQ", {
          items: [
            {
              question: "How do I register?",
              answer:
                "Available registration options and current event information appear on the event's published page.",
            },
            {
              question: "Can I ask about accessibility?",
              answer:
                "Please contact the club to discuss your needs before attending.",
            },
          ],
        }),
        gallery(context),
      ]);
    case "join":
      return document(context, [
        intro(
          action
            ? "Bring yourself. Find your people."
            : "Make service part of your story.",
          "Explore membership at your own pace. Start by getting to know the club.",
          "Membership",
          !action,
        ),
        story(
          "There's more to discover together.",
          "Share an interest, try a new activity and meet people who care about their community. Talk with the club about the expectations and opportunities of membership.",
        ),
        block("Programme", {
          title: "Your first steps",
          introduction:
            "Membership is a conversation, followed by a club review.",
          items: [
            {
              time: "01",
              title: "Get to know us",
              description: "Ask a question or discover an activity.",
            },
            {
              time: "02",
              title: "Share your interest",
              description:
                "Verify your email and complete the membership application.",
            },
            {
              time: "03",
              title: "Continue the conversation",
              description:
                "The club reviews applications and discusses the next steps with you.",
            },
          ],
        }),
        block("FAQ", {
          items: [
            {
              question: "What commitment is involved?",
              answer:
                "Speak with the club about meeting arrangements, activities and any membership requirements.",
            },
            {
              question: "Does signing in make me a member?",
              answer:
                "No. Email verification confirms your identity. Membership applications are reviewed separately by the club.",
            },
          ],
        }),
        ...(context.membershipFormId
          ? [block("Form", { formId: context.membershipFormId })]
          : [
              block("Button", {
                label: "Explore membership",
                href: "/membership",
                style: "accent",
                alignment: "left",
              }),
            ]),
      ]);
    case "contact":
      return document(context, [
        intro(
          action ? "Say hello." : "Let's start a conversation.",
          "Ask about an activity, explore membership or tell us about a community idea.",
          "Contact",
          !action,
        ),
        block("Columns", {
          ratio: action ? "balanced" : "wide-right",
          left: [
            block("Cards", {
              items: [
                {
                  title: "Curious about the club?",
                  text: "We welcome questions about getting to know us and taking part.",
                  href: context.links?.join || "/membership",
                  linkLabel: "Explore membership",
                  icon: "people",
                },
                {
                  title: "An idea for your community?",
                  text: "Share what matters to you and the kind of help you have in mind.",
                  href: "",
                  icon: "heart",
                },
              ],
            }),
          ],
          right: context.contactFormId
            ? [block("Form", { formId: context.contactFormId })]
            : [
                text(
                  "<h2>Talk with the club</h2><p>Questions and ideas are welcome.</p>",
                ),
              ],
        }),
      ]);
    case "gallery":
      return document(context, [
        intro(
          action
            ? "Little moments. Shared memories."
            : "A view of our community.",
          "A collection of photographs and stories.",
          "Gallery",
          !action,
        ),
        gallery(context),
        heading("A closer look"),
        block("ImageSlider", {
          aspectRatio: "wide",
          items: (context.assets ?? []).map((assetId, index) => ({
            assetId,
            alt: [
              "A garden in sunlight",
              "Young plants",
              "A vertical herb garden",
            ][index % 3],
            caption: context.demo
              ? "Illustrative photography · See the kit asset notes for credits."
              : "",
            focalX: 50,
            focalY: 50,
          })),
        }),
      ]);
    case "partners":
      return document(context, [
        intro(
          action
            ? "Better, together."
            : "Shared purpose. Stronger partnerships.",
          "Community work creates opportunities to contribute time, knowledge and practical support.",
          "Partners & supporters",
          !action,
        ),
        directory("Our partners", "partner"),
        directory("Our sponsors", "sponsor"),
        story(
          "A conversation can open possibilities.",
          "Interested in helping a project, sharing expertise or supporting an activity? Talk with the club about a meaningful way to contribute.",
        ),
        contactAction,
      ]);
    case "news":
      return document(context, [
        intro(
          "From the club",
          "Stories, ideas and moments worth sharing.",
          "News",
          !action,
        ),
        collection(
          { ...context, projectIds: [] },
          "",
          "Stories will appear here.",
        ),
      ]);
    case "story":
      return document(context, [
        intro(
          "A story worth sharing",
          "A thoughtful introduction to the people and ideas behind a moment.",
          "Club stories",
          !action,
        ),
        ...image(1),
        text(
          "<h2>Start with the story</h2><p>Good stories bring us closer to an experience. Share the details that matter and the perspective you want readers to take away.</p>",
        ),
        contactAction,
      ]);
    case "legal":
      return document(context, [
        intro("Legal information", "", ""),
        text(
          "<h2>Owner review required</h2><p>This draft layout requires the club's own legal information before publication. It is not a privacy notice or legal advice.</p>",
        ),
      ]);
  }
}
