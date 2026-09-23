"use client";

import type { CustomField } from "@puckeditor/core";
import { MediaPicker } from "@/ui/media-library";

export const assetField: CustomField<string> = {
  type: "custom",
  label: "Media image",
  render: ({ value, onChange }) => (
    <MediaPicker value={value} onChange={onChange} />
  ),
};

export const optionalAssetField: CustomField<string | undefined> = {
  type: "custom",
  label: "Image (optional)",
  render: ({ value, onChange }) => (
    <MediaPicker value={value ?? ""} onChange={onChange} />
  ),
};

export const aspectRatioField = {
  type: "select" as const,
  label: "Image shape",
  options: [
    { label: "Original proportions", value: "original" },
    { label: "Square · 1:1", value: "square" },
    { label: "Landscape · 4:3", value: "landscape" },
    { label: "Portrait · 3:4", value: "portrait" },
    { label: "Wide · 16:9", value: "wide" },
  ],
};
