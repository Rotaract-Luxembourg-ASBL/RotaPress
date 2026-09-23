"use client";

import { useContext } from "react";
import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import type { CmsSummary } from "../cms_schemas";
import type { PageCard } from "../page_collection";
import { useResource } from "@/ui/api";
import { EditorLocale } from "./event-collection-editor";
import { PageIntroBlock, PageCollectionBlock } from "./page-collection";

function PagePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const locale = useContext(EditorLocale);
  const { data } = useResource<{ items: CmsSummary[] }>(
    "/api/admin/cms/content",
  );
  return (
    <fieldset>
      <legend>Selected pages</legend>
      <p className="field-help">
        Cards use published titles, search descriptions and social images.
        Unpublished pages stay absent.
      </p>
      {data?.items
        .filter(
          (item) =>
            item.kind === "page" && item.locale === locale && !item.archived,
        )
        .map((item) => (
          <label className="cms-checkbox" key={item.id}>
            <input
              type="checkbox"
              checked={value.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, item.id]
                    : value.filter((id) => id !== item.id),
                )
              }
            />
            {item.title}
            {!item.publishedRevisionId && " (draft)"}
          </label>
        ))}
    </fieldset>
  );
}
function CollectionPreview(props: PuckBlocks["PageCollection"]) {
  const locale = useContext(EditorLocale);
  const { data, error } = useResource<{ items: PageCard[] }>(
    `/api/admin/cms/page-cards?locale=${locale}`,
  );
  if (error) return <p role="alert">{error}</p>;
  return (
    <PageCollectionBlock
      {...props}
      id="preview"
      items={props.pageIds.flatMap(
        (id) => data?.items.find((item) => item.id === id) ?? [],
      )}
    />
  );
}
const version = {
  type: "custom",
  visible: false,
  render: () => <></>,
} as const;
export const collectionConfig: Pick<
  Config<PuckBlocks>["components"],
  "PageIntro" | "PageCollection" | "Columns"
> = {
  Columns: {
    label: "Content columns",
    fields: {
      version,
      ratio: {
        type: "select",
        options: [
          { label: "Equal", value: "balanced" },
          { label: "Wide left", value: "wide-left" },
          { label: "Wide right", value: "wide-right" },
        ],
      },
      left: {
        type: "slot",
        disallow: [
          "Columns",
          "SiteRow",
          "SiteBrand",
          "SiteMenu",
          "SiteContact",
          "SiteSocial",
          "SiteFooterText",
        ],
      },
      right: {
        type: "slot",
        disallow: [
          "Columns",
          "SiteRow",
          "SiteBrand",
          "SiteMenu",
          "SiteContact",
          "SiteSocial",
          "SiteFooterText",
        ],
      },
    },
    defaultProps: { version: 1, ratio: "balanced", left: [], right: [] },
    render: ({ left: Left, right: Right, ratio }) => (
      <section className={`cms-block cms-columns cms-columns-${ratio}`}>
        <div>
          <Left minEmptyHeight={120} />
        </div>
        <div>
          <Right minEmptyHeight={120} />
        </div>
      </section>
    ),
  },
  PageIntro: {
    label: "Compact page introduction",
    fields: {
      version,
      eyebrow: { type: "text" },
      title: { type: "text" },
      introduction: { type: "textarea" },
      alignment: {
        type: "radio",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      eyebrow: "",
      title: "Our projects",
      introduction: "Ideas brought to life through shared effort.",
      alignment: "left",
    },
    render: (props) => <PageIntroBlock {...props} />,
  },
  PageCollection: {
    label: "Selected page cards",
    fields: {
      version,
      title: { type: "text" },
      introduction: { type: "textarea" },
      pageIds: { type: "custom", render: (props) => <PagePicker {...props} /> },
      layout: {
        type: "radio",
        options: [
          { label: "Card grid", value: "cards" },
          { label: "Featured carousel", value: "carousel" },
        ],
      },
      emptyText: {
        type: "text",
        label: "Message when no pages are published (blank hides)",
      },
    },
    defaultProps: {
      version: 1,
      title: "Our projects",
      introduction: "",
      pageIds: [],
      layout: "cards",
      emptyText: "Projects will appear here.",
    },
    render: (props) => <CollectionPreview {...props} />,
  },
};
