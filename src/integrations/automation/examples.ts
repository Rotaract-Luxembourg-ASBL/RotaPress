// Synthetic request examples, validated by api:check; never actual saved club data.
export const exampleId = "11111111-1111-4111-8111-111111111111";
export const pageExample = {
  locale: "en",
  title: "About our club",
  slug: "about-our-club",
  description: "An introduction for visitors.",
  socialImageId: null,
  data: {
    root: { props: {} },
    content: [
      {
        type: "RichText",
        props: {
          id: "intro",
          version: 1,
          text: "<p>Add verified club information here.</p>",
        },
      },
    ],
  },
};
export const importExample = {
  requestId: exampleId,
  pages: [
    {
      locale: "en",
      title: "About our club",
      slug: "about-our-club",
      description: "An introduction for visitors.",
      sections: [
        { heading: "Our story", text: "Add verified club information here." },
      ],
    },
  ],
};
export const eventExample = {
  title: "Community gathering",
  description: "Draft event details for review.",
  startsAt: "2030-06-15T10:00:00Z",
  endsAt: "2030-06-15T12:00:00Z",
  timezone: "Europe/Luxembourg",
  venue: "To be confirmed",
  visibility: "private",
};
export const directoryExample = {
  name: "Community partner",
  category: "partner",
  description: "Add approved profile information.",
  website: "",
  logoId: null,
};
export const formExample = {
  title: "Contact our club",
  description: "Send us a message.",
  submitLabel: "Send",
  successMessage: "Your response has been received.",
  fields: [
    {
      id: "message",
      type: "textarea",
      label: "Message",
      description: "",
      required: true,
      options: [],
      condition: null,
    },
  ],
};
