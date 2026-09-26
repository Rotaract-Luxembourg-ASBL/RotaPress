"use client";

import { Puck } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "@puckeditor/core/no-external.css";
import { isSitePart, type CmsDetail, type PublicSite } from "../cms_schemas";
import { websiteStyle } from "../appearance";
import { SitePartProvider } from "./site-part-blocks";
import { useResource } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import { Loading, Notice } from "@/ui/primitives";
import { puckConfig } from "./puck-config";
import { useEditorDocument } from "./use-editor-document";
import { EditorWorkspace } from "./editor-workspace";
import { InsertionProvider, BoundaryOverlay } from "./editor-insertion";
import { EditorContextMenu } from "./editor-context-menu";
import { EditorLocale } from "./event-collection-editor";
import { eventPageEditorHref } from "@/features/events/event_routes";
import { FormInsertionPrompt } from "./form-insertion-prompt";
import { editorRootZone } from "./editor-selection";
import { useRefreshOnFocus } from "./event-editor-scope";

type SiteContext = import("./site-part-blocks").SiteBlockContext & {
  site: PublicSite;
};
function EditorForm({
  initial,
  context,
}: {
  initial: CmsDetail;
  context?: SiteContext;
}) {
  const doc = useEditorDocument(initial);
  const { capabilities } = useCurrentUser();
  const [panel, setPanel] = useState<"blocks" | "outline" | null>(
    initial.draft.data.content.length ? null : "blocks",
  );
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [insertionZone, setInsertionZone] = useState(editorRootZone);
  const [insertionRequest, setInsertionRequest] = useState(0);
  const config = useMemo<typeof puckConfig>(
    () =>
      context
        ? {
            ...puckConfig,
            root: {
              fields: {},
              render: ({ children }) => (
                <SitePartProvider value={context}>
                  <div
                    className={
                      isSitePart(initial.kind)
                        ? "cms-public cms-site-part site-part-editor-preview"
                        : "cms-public cms-content"
                    }
                    data-theme={
                      initial.draft.data.root.props.demonstration
                        ? initial.draft.data.root.props.kit
                        : context.site.themeId
                    }
                    style={websiteStyle(
                      initial.draft.data.root.props.demonstration &&
                        initial.draft.data.root.props.kit
                        ? {
                            ...context.site,
                            themeId: initial.draft.data.root.props.kit,
                            accentColor: null,
                            font: null,
                          }
                        : context.site,
                    )}
                  >
                    {children}
                  </div>
                </SitePartProvider>
              ),
            },
          }
        : puckConfig,
    [
      context,
      initial.kind,
      initial.draft.data.root.props.demonstration,
      initial.draft.data.root.props.kit,
    ],
  );
  return (
    <SitePartProvider
      value={
        context ?? {
          clubName: "",
          site: { navigation: [], footerText: "", socialLinks: [] },
        }
      }
    >
      <EditorLocale value={initial.locale}>
        <InsertionProvider
          disabled={doc.busy || doc.readOnly}
          onInsert={(index, _type, zone = editorRootZone) => {
            setInsertionRequest((request) => request + 1);
            setInsertionIndex(index);
            setInsertionZone(zone);
            setPanel("blocks");
          }}
        >
          <div className="cms-puck editor-fullscreen">
            <Puck<typeof puckConfig>
              key={doc.editorKey}
              config={config}
              data={doc.data}
              iframe={{ enabled: false }}
              fieldTransforms={{ richtext: ({ value }) => value }}
              overrides={{ componentOverlay: BoundaryOverlay }}
              permissions={{
                edit: !doc.readOnly && !doc.busy,
                drag: !doc.readOnly && !doc.busy,
                insert: !doc.readOnly && !doc.busy,
                duplicate: !doc.readOnly && !doc.busy,
                delete: !doc.readOnly && !doc.busy,
              }}
              height="100dvh"
              onAction={doc.history.onAction}
              onChange={(data) => {
                doc.setData(data);
                doc.clearMessage();
              }}
            >
              {initial.kind === "page" && (
                <FormInsertionPrompt disabled={doc.busy || doc.readOnly} />
              )}
              <EditorContextMenu
                disabled={doc.busy || doc.readOnly}
                onInsert={(index, zone = editorRootZone) => {
                  setInsertionRequest((request) => request + 1);
                  setInsertionIndex(index);
                  setInsertionZone(zone);
                  setPanel("blocks");
                }}
              />
              <EditorWorkspace
                document={doc}
                canPublish={capabilities.includes("cms.publish")}
                panel={panel}
                setPanel={setPanel}
                insertionIndex={insertionIndex}
                setInsertionIndex={setInsertionIndex}
                insertionZone={insertionZone}
                setInsertionZone={setInsertionZone}
                insertionRequest={insertionRequest}
              />
            </Puck>
          </div>
        </InsertionProvider>
      </EditorLocale>
    </SitePartProvider>
  );
}

function ThemedEditor({ initial }: { initial: CmsDetail }) {
  const { data, error, refresh } = useResource<SiteContext>(
    `/api/admin/cms/site/context?locale=${initial.locale}`,
  );
  useRefreshOnFocus(refresh);
  return data ? (
    <EditorForm initial={initial} context={data} />
  ) : error ? (
    <Notice>{error}</Notice>
  ) : (
    <Loading />
  );
}

function EventEditorRedirect({
  eventId,
  pageId,
  locale,
}: {
  eventId: string;
  pageId: string;
  locale: string;
}) {
  const router = useRouter();
  const href = eventPageEditorHref(eventId, pageId, locale);
  useEffect(() => router.replace(href), [href, router]);
  return <Loading />;
}

export function CmsEditor({ id, locale }: { id: string; locale: string }) {
  const { data, error } = useResource<CmsDetail>(
    `/api/admin/cms/content/${id}?locale=${encodeURIComponent(locale)}`,
  );
  return error ? (
    <div className="editor-loading">
      <Notice>{error}</Notice>
    </div>
  ) : data ? (
    data.event ? (
      <EventEditorRedirect
        eventId={data.event.id}
        pageId={data.id}
        locale={data.locale}
      />
    ) : (
      <ThemedEditor key={`${data.id}-${data.locale}`} initial={data} />
    )
  ) : (
    <Loading />
  );
}
