"use client";

import type { Config } from "@puckeditor/core";
import { clubCodeConfig } from "./club-code-config";
import { calendarBlockConfig } from "./calendar-block";
import { projectCollectionConfig } from "./project-collection-editor";
import { collectionConfig } from "./page-collection-config";
import type { Block } from "../cms_schemas";
import { SectionPicker } from "./reusable-section-picker";
import {
  CallToActionBlock,
  CardsBlock,
  FaqBlock,
  GalleryBlock,
  HeroBlock,
  SponsorsBlock,
  StatisticsBlock,
  TeamBlock,
} from "./block-renderers";
import { RichTextEditorPreview } from "./rich-text-preview";
import {
  aspectRatioField,
  assetField,
  optionalAssetField,
} from "./puck-fields";
import { basicBlockConfig } from "./basic-block-config";
import { formField, FormEditorPreview } from "./form-block";
import { EventRegistrationPreview } from "./event-registration-block";
import { EditableImage } from "./editable-image";
import { siteBlockConfig } from "./site-block-config";
import { eventContentConfig } from "./event-content-config";
import { eventReferenceConfig } from "./event-reference-config";
import { partnerBlockConfig } from "./directory-block";
import { withDesign } from "./designed-config";
import { sectionBlockConfig, featureIconField } from "./section-block-config";
import {
  imageWidthField,
  flipHorizontalField,
  flipVerticalField,
} from "./image-fields";

export type PuckBlocks = {
  [T in Block["type"]]: Omit<Extract<Block, { type: T }>["props"], "id">;
};
const version = 1 as const;

export const puckConfig: Config<PuckBlocks> = withDesign({
  root: {
    fields: {},
    render: ({ children }) => <div className="cms-content">{children}</div>,
  },
  categories: {
    connected: {
      title: "Projects, calendar & events",
      components: ["ProjectCollection", "Calendar", "EventCollection"],
    },
    participation: {
      title: "Contact & participation",
      components: ["Form", "EventRegistration"],
    },
    directory: {
      title: "People & shared content",
      components: [
        "ClubDetails",
        "PartnerCollection",
        "PageCollection",
        "SharedSection",
      ],
    },
    event: {
      title: "Event content",
      components: [
        "EventHero",
        "EventPractical",
        "EventImpact",
        "EventFooter",
        "EventPackages",
        "EventPrizes",
        "EventWinners",
        "EventContact",
        "EventFlyer",
        "EventShare",
      ],
    },
    site: {
      title: "Shared site parts",
      components: [
        "SiteRow",
        "SiteBrand",
        "SiteMenu",
        "SiteContact",
        "SiteSocial",
        "SiteFooterText",
      ],
    },
    basics: {
      title: "Basic blocks",
      components: [
        "Columns",
        "PageIntro",
        "Heading",
        "RichText",
        "Button",
        "Divider",
        "Spacer",
      ],
    },
    custom: { title: "Custom content", components: ["CustomCode"] },
    content: {
      title: "Images & sections",
      components: [
        "Hero",
        "HeroSlider",
        "FeatureSection",
        "Cover",
        "Image",
        "Gallery",
        "ImageSlider",
        "Cards",
        "CallToAction",
      ],
    },
    community: {
      title: "Information & activities",
      components: ["Programme", "ParticipationOptions", "Statistics", "FAQ"],
    },
  },
  components: {
    ...clubCodeConfig,
    Calendar: calendarBlockConfig,
    ProjectCollection: projectCollectionConfig,
    ...eventReferenceConfig,
    ...eventContentConfig,
    ...collectionConfig,
    ...siteBlockConfig,
    ...basicBlockConfig,
    ...sectionBlockConfig,
    PartnerCollection: partnerBlockConfig,
    Form: {
      label: "Form",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        formId: formField,
      },
      defaultProps: { version, formId: "" },
      // Keep the observed element stable while the selected form loads.
      render: ({ formId }) => (
        <div className="cms-form-editor-block">
          <FormEditorPreview formId={formId} />
        </div>
      ),
    },
    EventRegistration: {
      label: "Event registration",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
      },
      defaultProps: { version },
      render: () => <EventRegistrationPreview />,
    },
    Hero: {
      label: "Hero",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        title: { type: "text", label: "Heading", contentEditable: true },
        body: {
          type: "textarea",
          label: "Introduction",
          contentEditable: true,
        },
        buttonLabel: { type: "text", label: "Button label" },
        buttonHref: { type: "text", label: "Button link" },
        assetId: { ...optionalAssetField, label: "Hero image" },
        imageAlt: { type: "text", label: "Image alternative text" },
        imagePosition: {
          type: "radio",
          label: "Image position",
          options: [
            { label: "Left", value: "left" },
            { label: "Right", value: "right" },
          ],
        },
      },
      defaultProps: {
        version,
        title: "A place to belong.",
        body: "Write an introduction to your club.",
        buttonLabel: "",
        buttonHref: "",
        assetId: "",
        imageAlt: "",
        imagePosition: "right",
      },
      render: (props) => <HeroBlock {...props} />,
    },
    RichText: {
      label: "Rich text",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        text: {
          type: "richtext",
          label: "Text",
          options: {
            heading: { levels: [2, 3] },
            code: false,
            codeBlock: false,
            horizontalRule: false,
          },
        },
      },
      defaultProps: { version, text: "<p>Tell your community’s story.</p>" },
      render: ({ text }) => <RichTextEditorPreview text={text} />,
    },
    Image: {
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        assetId: assetField,
        alt: { type: "text", label: "Alternative text" },
        caption: { type: "text", label: "Caption" },
        alignment: {
          type: "radio",
          label: "Alignment",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
        width: {
          type: "select",
          label: "Image width",
          options: [
            { label: "Full width", value: "full" },
            { label: "Wide · up to 960px", value: "wide" },
            { label: "Medium · up to 640px", value: "medium" },
            { label: "Small · up to 360px", value: "small" },
          ],
        },
        widthPx: imageWidthField,
        focalX: {
          type: "number",
          label: "Crop focus horizontal (%)",
          min: 0,
          max: 100,
          step: 1,
        },
        focalY: {
          type: "number",
          label: "Crop focus vertical (%)",
          min: 0,
          max: 100,
          step: 1,
        },
        flipHorizontal: flipHorizontalField,
        flipVertical: flipVerticalField,
        aspectRatio: aspectRatioField,
        fit: {
          type: "radio",
          label: "Image fit",
          options: [
            { label: "Fill shape", value: "cover" },
            { label: "Show whole image", value: "contain" },
          ],
        },
        corners: {
          type: "radio",
          label: "Corners",
          options: [
            { label: "Square", value: "square" },
            { label: "Soft", value: "soft" },
            { label: "Round", value: "round" },
          ],
        },
        href: { type: "text", label: "Image link (optional)" },
      },
      defaultProps: {
        version,
        assetId: "",
        alt: "",
        caption: "",
        alignment: "center",
        width: "full",
        widthPx: 0,
        focalX: 50,
        focalY: 50,
        flipHorizontal: false,
        flipVertical: false,
        aspectRatio: "original",
        fit: "cover",
        corners: "soft",
        href: "",
      },
      render: (props) => <EditableImage {...props} />,
    },
    Gallery: {
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        columns: {
          type: "radio",
          label: "Columns on desktop",
          options: [
            { label: "Two", value: "two" },
            { label: "Three", value: "three" },
            { label: "Four", value: "four" },
          ],
        },
        aspectRatio: aspectRatioField,
        items: {
          type: "array",
          label: "Images",
          max: 30,
          arrayFields: {
            assetId: assetField,
            alt: { type: "text", label: "Alternative text" },
            caption: { type: "text", label: "Caption" },
          },
          defaultItemProps: { assetId: "", alt: "" },
          getItemSummary: (item) => item.alt || "Image",
        },
      },
      defaultProps: {
        version,
        items: [],
        columns: "three",
        aspectRatio: "landscape",
      },
      render: (props) => <GalleryBlock {...props} />,
    },
    Cards: {
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        items: {
          type: "array",
          label: "Cards",
          max: 20,
          arrayFields: {
            title: { type: "text" },
            text: { type: "textarea" },
            href: { type: "text", label: "Link" },
            linkLabel: { type: "text", label: "Link text" },
            assetId: optionalAssetField,
            alt: { type: "text", label: "Image description" },
            icon: featureIconField,
          },
          defaultItemProps: { title: "New card", text: "", href: "" },
          getItemSummary: (item) => item.title,
        },
      },
      defaultProps: {
        version,
        items: [
          {
            title: "A shared purpose",
            text: "Tell people what your club does.",
            href: "",
          },
        ],
      },
      render: (props) => <CardsBlock {...props} />,
    },
    Statistics: {
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        items: {
          type: "array",
          label: "Statistics",
          max: 12,
          arrayFields: { value: { type: "text" }, label: { type: "text" } },
          defaultItemProps: { value: "", label: "" },
          getItemSummary: (item) => item.label || "Statistic",
        },
      },
      defaultProps: { version, items: [] },
      render: (props) => <StatisticsBlock {...props} />,
    },
    CallToAction: {
      label: "Call to action",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        title: { type: "text" },
        text: { type: "textarea" },
        label: { type: "text", label: "Button label" },
        href: { type: "text", label: "Button link" },
      },
      defaultProps: {
        version,
        title: "Take the next step.",
        text: "",
        label: "Get involved",
        href: "/membership",
      },
      render: (props) => <CallToActionBlock {...props} />,
    },
    FAQ: {
      label: "Questions and answers",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        items: {
          type: "array",
          label: "Questions",
          max: 30,
          arrayFields: {
            question: { type: "text" },
            answer: { type: "textarea" },
          },
          defaultItemProps: { question: "A common question", answer: "" },
          getItemSummary: (item) => item.question,
        },
      },
      defaultProps: { version, items: [] },
      render: (props) => <FaqBlock {...props} />,
    },
    Team: {
      label: "Team (existing page content)",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        items: {
          type: "array",
          label: "People",
          max: 40,
          arrayFields: {
            name: { type: "text" },
            role: { type: "text" },
            assetId: assetField,
          },
          defaultItemProps: { name: "", role: "", assetId: "" },
          getItemSummary: (item) => item.name || "Person",
        },
      },
      defaultProps: { version, items: [] },
      render: (props) => <TeamBlock {...props} />,
    },
    Sponsors: {
      label: "Sponsors (page-only)",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        items: {
          type: "array",
          label: "Sponsors",
          max: 40,
          arrayFields: {
            name: { type: "text" },
            href: { type: "text", label: "Website" },
            assetId: assetField,
          },
          defaultItemProps: { name: "", href: "", assetId: "" },
          getItemSummary: (item) => item.name || "Sponsor",
        },
      },
      defaultProps: { version, items: [] },
      render: (props) => <SponsorsBlock {...props} />,
    },
    SharedSection: {
      label: "Reusable section",
      fields: {
        version: { type: "custom", visible: false, render: () => <></> },
        sectionId: {
          type: "custom",
          render: ({ value, onChange, readOnly }) => (
            <SectionPicker
              value={value}
              onChange={onChange}
              disabled={readOnly}
            />
          ),
        },
      },
      defaultProps: { version, sectionId: "" },
      render: () => (
        <section className="cms-block cms-section-reference">
          Reusable section · Its published content appears on the saved preview
          and website.
        </section>
      ),
    },
  },
});
