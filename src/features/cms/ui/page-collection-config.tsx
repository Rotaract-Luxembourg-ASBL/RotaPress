"use client";

import { useContext } from "react";
import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import type { PageCard } from "../page_collection";
import { useResource } from "@/ui/api";
import { EditorLocale } from "./event-collection-editor";
import { PageIntroBlock, PageCollectionBlock } from "./page-collection";
import { PagePicker } from "./page-picker";
import { useRefreshOnFocus } from "./event-editor-scope";
import { ConnectionError } from "./connected-source";

function CollectionPreview(props: PuckBlocks["PageCollection"]) {
  const locale = useContext(EditorLocale);
  const { data, error, refresh } = useResource<{ items: PageCard[] }>(
    `/api/admin/cms/page-cards?locale=${locale}`,
  );
  useRefreshOnFocus(refresh);
  if (error) return <ConnectionError error={error} onRetry={refresh} />;
  if (!data)
    return (
      <p className="cms-block field-help" role="status">
        Loading published pages...
      </p>
    );
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
      pageIds: {
        type: "custom",
        label: "Page sources",
        render: ({ value, onChange, readOnly }) => (
          <PagePicker value={value} onChange={onChange} disabled={readOnly} />
        ),
      },
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
