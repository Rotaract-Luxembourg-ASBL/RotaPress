"use client";

import type { Config, CustomField } from "@puckeditor/core";
import { MediaPicker } from "@/ui/media-library";
import type { PuckBlocks } from "./puck-config";
import { FileBlock, AudioBlock, VideoBlock } from "./file-blocks";

function fileField(kind: "document" | "audio" | "video"): CustomField<string> {
  return {
    type: "custom",
    label:
      kind === "document"
        ? "PDF document"
        : kind === "audio"
          ? "Audio recording"
          : "Video",
    render: ({ value, onChange }) => (
      <MediaPicker value={value} onChange={onChange} kind={kind} />
    ),
  };
}
const versionField = {
  type: "custom" as const,
  visible: false,
  render: () => <></>,
};

export const fileBlockConfig = {
  File: {
    label: "PDF download",
    fields: {
      version: versionField,
      assetId: fileField("document"),
      label: { type: "text", label: "Download label" },
      description: { type: "textarea" },
    },
    defaultProps: {
      version: 1,
      assetId: "",
      label: "Download PDF",
      description: "",
    },
    render: (props) => <FileBlock {...props} />,
  },
  Audio: {
    label: "Audio",
    fields: {
      version: versionField,
      assetId: fileField("audio"),
      title: { type: "text" },
      transcript: { type: "textarea", label: "Transcript" },
    },
    defaultProps: { version: 1, assetId: "", title: "", transcript: "" },
    render: (props) => <AudioBlock {...props} />,
  },
  Video: {
    label: "Video",
    fields: {
      version: versionField,
      assetId: fileField("video"),
      posterAssetId: {
        type: "custom",
        label: "Poster photograph",
        render: ({ value, onChange }) => (
          <MediaPicker value={value || ""} onChange={onChange} kind="image" />
        ),
      },
      title: { type: "text" },
      transcript: { type: "textarea", label: "Transcript / audio description" },
      captionLanguage: {
        type: "text",
        label: "Caption language (en, fr, lb…)",
      },
      captionLabel: { type: "text", label: "Caption menu label" },
      captions: {
        type: "array",
        label: "Timed captions (seconds, in playback order)",
        max: 500,
        arrayFields: {
          start: {
            type: "number",
            label: "Start (seconds)",
            min: 0,
            max: 86_400,
            step: 0.001,
          },
          end: {
            type: "number",
            label: "End (seconds)",
            min: 0,
            max: 86_400,
            step: 0.001,
          },
          text: { type: "textarea", label: "Caption text" },
        },
        defaultItemProps: { start: 0, end: 3, text: "Caption" },
        getItemSummary: (cue) =>
          `${cue.start}–${cue.end}s: ${cue.text || "Caption"}`,
      },
    },
    defaultProps: {
      version: 1,
      assetId: "",
      posterAssetId: "",
      title: "",
      transcript: "",
      captionLanguage: "en",
      captionLabel: "Captions",
      captions: [],
    },
    render: (props) => <VideoBlock {...props} />,
  },
} satisfies Pick<Config<PuckBlocks>["components"], "File" | "Audio" | "Video">;
