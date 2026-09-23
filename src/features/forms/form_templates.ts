import {
  formDefinitionSchema,
  starterDefinition,
  type FormDefinition,
  type FormField,
  type formTemplateIds,
} from "./form_schemas";

export type FormTemplateId = (typeof formTemplateIds)[number];
export const formTemplates: Record<
  FormTemplateId,
  {
    title: string;
    description: string;
    kind: "contact" | "membership";
  }
> = {
  contact: {
    title: "Contact",
    description: "A name, reply email and message for general enquiries.",
    kind: "contact",
  },
  membership: {
    title: "Membership application",
    description: "A verified applicant's introduction for the club to review.",
    kind: "membership",
  },
  volunteer: {
    title: "Volunteer interest",
    description:
      "Discover interests, availability and how to contact prospective volunteers.",
    kind: "contact",
  },
  feedback: {
    title: "Feedback",
    description:
      "Collect a rating and suggestions, with optional follow-up contact.",
    kind: "contact",
  },
  rsvp: {
    title: "RSVP enquiry",
    description:
      "Ask about attendance plans. This records interest; it does not reserve a place.",
    kind: "contact",
  },
  partnership: {
    title: "Partnership enquiry",
    description:
      "Hear from organizations offering time, products or financial support.",
    kind: "contact",
  },
  blank: {
    title: "Blank form",
    description: "Start with one question and build your own form.",
    kind: "contact",
  },
  event_feedback: {
    title: "Event feedback",
    description:
      "A two-step review with a rating, highlights and optional follow-up.",
    kind: "contact",
  },
  speaker: {
    title: "Speaker application",
    description:
      "Collect a speaker profile, talk proposal and preferred format over two pages.",
    kind: "contact",
  },
  newsletter: {
    title: "Newsletter signup",
    description: "Contact details, interests and explicit email consent.",
    kind: "contact",
  },
  waitlist: {
    title: "Waiting list",
    description:
      "Collect interest and preferred activities. This does not reserve a place.",
    kind: "contact",
  },
  project_proposal: {
    title: "Project proposal",
    description:
      "A guided proposal with objectives, budget and a conditional support question.",
    kind: "contact",
  },
};

function field(
  id: string,
  type: FormField["type"],
  label: string,
  extra: Partial<FormField> = {},
): FormField {
  return {
    id,
    type,
    label,
    description: "",
    required: true,
    options: [],
    condition: null,
    ...extra,
  };
}
const identity = () => [
  field("name", "text", "Your name"),
  field("email", "email", "Your email"),
];

/** Templates create ordinary private drafts; form kind retains its existing authority. */
export function templateDefinition(
  id: FormTemplateId,
  title?: string,
): FormDefinition {
  if (id === "contact" || id === "membership")
    return starterDefinition(id, title);
  let fields: FormField[];
  switch (id) {
    case "volunteer":
      fields = [
        ...identity(),
        field("interest", "choice", "How would you like to help?", {
          options: [
            "Event support",
            "Community projects",
            "Communications",
            "Something else",
          ],
        }),
        field("other_interest", "text", "Tell us how you would like to help", {
          condition: { fieldId: "interest", equals: "Something else" },
        }),
        field("availability", "textarea", "When are you usually available?", {
          required: false,
          description: "Share the days or times that work for you.",
        }),
        field("phone", "phone", "Phone number", { required: false }),
      ];
      break;
    case "feedback":
      fields = [
        field("rating", "choice", "How was your experience?", {
          options: ["Excellent", "Good", "Fair", "Needs improvement"],
        }),
        field("message", "textarea", "What worked well, or could be better?", {
          required: false,
        }),
        field("follow_up", "checkbox", "I would like the team to follow up", {
          required: false,
        }),
        field("name", "text", "Your name", {
          required: false,
          condition: { fieldId: "follow_up", equals: true },
        }),
        field("email", "email", "Your email", {
          condition: { fieldId: "follow_up", equals: true },
        }),
      ];
      break;
    case "rsvp":
      fields = [
        ...identity(),
        field("activity", "text", "Which activity are you interested in?"),
        field("attendance", "choice", "Do you plan to attend?", {
          options: ["Yes", "Maybe", "No"],
        }),
        field("message", "textarea", "Questions for the organizers", {
          required: false,
        }),
      ];
      break;
    case "partnership":
      fields = [
        ...identity(),
        field("organization", "text", "Organization or business"),
        field("support", "choice", "How could we work together?", {
          options: [
            "Volunteer time",
            "Products or services",
            "Financial support",
            "Another idea",
          ],
        }),
        field("message", "textarea", "Tell us about your proposal"),
        field("website", "text", "Your website", { required: false }),
      ];
      break;
    case "blank":
      fields = [field("message", "textarea", "Your message")];
      break;
    case "event_feedback":
      fields = [
        field("rating", "rating", "How was your experience?"),
        field("highlights", "multiselect", "What did you enjoy?", {
          options: ["People", "Activities", "Venue", "Learning"],
          required: false,
        }),
        field("next", "page_break", "Your suggestions", { required: false }),
        field("suggestions", "textarea", "What could we improve?", {
          required: false,
        }),
        field("follow_up", "checkbox", "I would like a reply", {
          required: false,
        }),
        field("email", "email", "Your email", {
          condition: { fieldId: "follow_up", equals: true },
        }),
      ];
      break;
    case "speaker":
      fields = [
        ...identity(),
        field("portfolio", "url", "Website or portfolio", { required: false }),
        field("proposal", "page_break", "Your talk", { required: false }),
        field("topic", "text", "Talk title"),
        field("summary", "textarea", "What will people learn?"),
        field("format", "radio", "Preferred format", {
          options: ["Talk", "Workshop", "Panel"],
        }),
      ];
      break;
    case "newsletter":
      fields = [
        ...identity(),
        field("interests", "multiselect", "News you are interested in", {
          options: ["Club news", "Events", "Volunteering"],
          required: false,
        }),
        field(
          "permission",
          "consent",
          "I agree to receive the updates I selected.",
          {
            description:
              "You can ask the club to stop sending updates at any time.",
          },
        ),
      ];
      break;
    case "waitlist":
      fields = [
        ...identity(),
        field("interest", "radio", "What interests you?", {
          options: [
            "Community projects",
            "Social activities",
            "Professional development",
          ],
        }),
        field("notes", "textarea", "Anything else we should know?", {
          required: false,
        }),
      ];
      break;
    case "project_proposal":
      fields = [
        ...identity(),
        field("project", "page_break", "Your project", { required: false }),
        field("title", "text", "Project name"),
        field("objectives", "textarea", "Who will this help and how?"),
        field("budget", "number", "Estimated budget", {
          validation: { minimum: 0 },
        }),
        field(
          "support",
          "textarea",
          "How could the club support this budget?",
          {
            requiredWhen: {
              mode: "all",
              rules: [
                { fieldId: "budget", operator: "greater_than", value: "0" },
              ],
            },
          },
        ),
      ];
      break;
  }
  return formDefinitionSchema.parse({
    title: title ?? formTemplates[id].title,
    description:
      id === "rsvp"
        ? "Share your plans with the organizers. Your response is an enquiry, not a confirmed booking."
        : "",
    submitLabel: id === "feedback" ? "Send feedback" : "Send response",
    successMessage:
      id === "rsvp"
        ? "Your interest has been received. The organizers will confirm any arrangements separately."
        : "Thank you. Your response has been received.",
    layout: "stacked",
    fields,
  });
}
