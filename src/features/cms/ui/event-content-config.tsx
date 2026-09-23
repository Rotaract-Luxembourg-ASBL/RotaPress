"use client";

import type { Config } from "@puckeditor/core";
import {
  EventContactBlock,
  EventFlyerBlock,
  EventShareBlock,
} from "@/features/events/ui/event-content-blocks";
import type { PuckBlocks } from "./puck-config";
import { assetField } from "./puck-fields";
import { EventPackagesPreview } from "./event-packages-block";
import { EventPrizesPreview } from "./event-prizes-block";
import { EventWinnersPreview } from "./event-winners-block";

const version = {
  type: "custom",
  visible: false,
  render: () => <></>,
} as const;

export const eventContentConfig: Pick<
  Config<PuckBlocks>["components"],
  | "EventContact"
  | "EventFlyer"
  | "EventShare"
  | "EventPackages"
  | "EventPrizes"
  | "EventWinners"
> = {
  EventWinners: {
    label: "Demonstration winners",
    fields: { version, title: { type: "text", label: "Heading" } },
    defaultProps: { version: 1, title: "Demonstration winners" },
    render: ({ title }) => <EventWinnersPreview title={title} />,
  },
  EventPrizes: {
    label: "Published prizes",
    fields: { version, title: { type: "text", label: "Heading" } },
    defaultProps: { version: 1, title: "Event prizes" },
    render: ({ title }) => <EventPrizesPreview title={title} />,
  },
  EventPackages: {
    label: "Published packages",
    fields: { version, title: { type: "text", label: "Heading" } },
    defaultProps: { version: 1, title: "Choose your package" },
    render: ({ title }) => <EventPackagesPreview title={title} />,
  },
  EventContact: {
    label: "Contact",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
      text: { type: "textarea", label: "Contact introduction" },
      email: { type: "text", label: "Public contact email" },
      phone: { type: "text", label: "Public contact phone" },
      website: { type: "text", label: "Contact website (https)" },
    },
    defaultProps: {
      version: 1,
      title: "Contact the event team",
      text: "",
      email: "",
      phone: "",
      website: "",
    },
    render: (props) => <EventContactBlock {...props} />,
  },
  EventFlyer: {
    label: "Flyer",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
      assetId: { ...assetField, label: "Flyer image" },
      alt: { type: "textarea", label: "Flyer image description" },
      caption: { type: "textarea", label: "Flyer caption" },
    },
    defaultProps: {
      version: 1,
      title: "Event flyer",
      assetId: "",
      alt: "",
      caption: "",
    },
    render: (props) =>
      props.assetId ? (
        <EventFlyerBlock {...props} />
      ) : (
        <div className="cms-image-placeholder">
          Choose a public flyer image from the media library.
        </div>
      ),
  },
  EventShare: {
    label: "Share event",
    fields: {
      version,
      title: { type: "text", label: "Heading" },
    },
    defaultProps: { version: 1, title: "Share this event" },
    render: (props) => <EventShareBlock title={props.title} preview />,
  },
};
