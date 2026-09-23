"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { MediaPickerScope } from "@/ui/media-picker-scope";
import { ActionsMenu } from "@/ui/actions-menu";
import { Icon } from "@/ui/icon";
import {
  cmsDataSchema,
  type Block,
  type CmsDetail,
  type CmsData,
} from "@/features/cms/cms_schemas";
import { puckConfig } from "@/features/cms/ui/puck-config";
import {
  EventEditorScope,
  useRefreshOnFocus,
} from "@/features/cms/ui/event-editor-scope";
import { EditorLocale } from "@/features/cms/ui/event-collection-editor";
import { UnsavedPreview } from "@/features/cms/ui/unsaved-preview";
import { eventBlockTypes, type EventModuleState } from "../event_modules";
import { defaultEventDesign } from "../event_design";
import {
  eventSectionTitle,
  eventSectionAnchor,
  eventPageNavigation,
} from "../event_sections";
import { mergeEventLayout } from "../event_layout_recipes";
import type { EventLayoutId } from "../event_layouts";
import type { EventDraft } from "../event_schemas";
import { EventSectionFields, sectionLabel } from "./event-section-fields";
import { EventPageAppearance, EventPageLayout } from "./event-page-layout";
import { useEventPageDocument } from "./use-event-page-document";
import { EventSectionOutline } from "./event-section-outline";
import { EventSectionLibrary } from "./event-section-library";
import { EventPageSettings } from "./event-page-settings";
import { EventLayoutPicker } from "./event-layout-picker";

function EventPageForm({
  initial,
  locked,
  active,
  onDirtyChange,
  onEventSaved,
}: {
  initial: CmsDetail;
  locked: boolean;
  active: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onEventSaved?: (event: EventDraft) => void;
}) {
  const doc = useEventPageDocument(initial, onEventSaved);
  const event = initial.event!;
  const [tab, setTab] = useState("content");
  const [panel, setPanel] = useState(
    initial.draft.data.content[0]?.props.id ?? "",
  );
  const [adding, setAdding] = useState(false);
  const [choosingLayout, setChoosingLayout] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [fullPreview, setFullPreview] = useState(false);
  const [undo, setUndo] = useState<CmsData>();
  const {
    data: workspace,
    refresh,
    error: workspaceError,
  } = useResource<{ modules: EventModuleState[] }>(
    `/api/admin/events/${event.id}/website`,
  );
  useRefreshOnFocus(refresh);
  useEffect(() => {
    onDirtyChange?.(doc.dirty);
  }, [doc.dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const hidden = doc.draft.data.root.props.eventHiddenSections ?? [];
  const selected = doc.draft.data.content.find(
    (block) => block.props.id === panel,
  );
  const disabled = locked || doc.busy || doc.readOnly;
  const updateData = (data: CmsData) => {
    setUndo(undefined);
    doc.change({ ...doc.draft, data });
  };
  const enabled = (key: string) =>
    workspace?.modules.some(
      (module) => module.key === key && module.state === "enabled",
    );
  const available = (
    Object.keys(puckConfig.components) as Block["type"][]
  ).filter(
    (type) =>
      eventBlockTypes[event.moduleKey].includes(type) &&
      (type !== "Form" || enabled("forms")) &&
      (type !== "EventRegistration" || enabled("registration")) &&
      (!["EventPrizes", "EventWinners"].includes(type) || enabled("prizes")),
  );
  function select(id: string) {
    setPanel(id);
    setTab("content");
    requestAnimationFrame(() =>
      document.querySelector(".event-studio-content")?.scrollTo({ top: 0 }),
    );
  }
  function add(type: Block["type"], category?: "partner" | "sponsor" | "team") {
    const block = cmsDataSchema.parse({
      root: { props: {} },
      content: [
        {
          type,
          props: {
            ...structuredClone(puckConfig.components[type].defaultProps),
            id: crypto.randomUUID(),
          },
        },
      ],
    }).content[0];
    if (block.type === "PartnerCollection" && category)
      Object.assign(block.props, {
        category,
        selectionMode: "selected",
        title:
          category === "team"
            ? "Meet the team"
            : category === "sponsor"
              ? "Our sponsors"
              : "Our partners",
        presentation: category === "sponsor" ? "logos" : "cards",
      });
    const content = [...doc.draft.data.content];
    const footer = content.findIndex((item) => item.type === "EventFooter");
    content.splice(
      footer >= 0 && type !== "EventFooter" ? footer : content.length,
      0,
      block,
    );
    updateData({ ...doc.draft.data, content });
    select(block.props.id);
    setAdding(false);
  }
  function move(index: number, direction: number) {
    const content = [...doc.draft.data.content];
    if (index + direction < 0 || index + direction >= content.length) return;
    [content[index], content[index + direction]] = [
      content[index + direction],
      content[index],
    ];
    updateData({ ...doc.draft.data, content });
  }
  function toggle(id: string, visible: boolean) {
    const ids = hidden.filter((value) => value !== id);
    updateData({
      ...doc.draft.data,
      root: {
        props: {
          ...doc.draft.data.root.props,
          eventHiddenSections: visible ? ids : [...ids, id],
        },
      },
    });
  }
  function remove() {
    if (!selected) return;
    const content = doc.draft.data.content.filter(
      (block) => block.props.id !== selected.props.id,
    );
    updateData({
      ...doc.draft.data,
      content,
      root: {
        props: {
          ...doc.draft.data.root.props,
          eventHiddenSections: hidden.filter((id) => id !== selected.props.id),
        },
      },
    });
    setUndo(doc.draft.data);
    setPanel(content[0]?.props.id ?? "");
  }
  function duplicate() {
    if (!selected) return;
    const block = structuredClone(selected);
    block.props.id = crypto.randomUUID();
    const content = [...doc.draft.data.content];
    content.splice(
      content.findIndex((item) => item.props.id === panel) + 1,
      0,
      block,
    );
    updateData({ ...doc.draft.data, content });
    select(block.props.id);
  }
  function applyLayout(id: EventLayoutId) {
    const data = mergeEventLayout(doc.draft.data, id);
    updateData(data);
    setUndo(doc.draft.data);
    select(data.content[0].props.id);
    setAdding(false);
    setChoosingLayout(false);
  }
  return (
    <MediaPickerScope value={event.id}>
      <EventEditorScope value={event}>
        <EditorLocale value={initial.locale}>
          <div className="event-page-designer" aria-label="Design event page">
            <div className="event-designer-toolbar">
              <div role="status">
                <strong>
                  {doc.dirty
                    ? "Unsaved page changes"
                    : doc.detail.publishedRevisionId === doc.detail.draft.id
                      ? "Matches published page"
                      : "Draft saved"}
                </strong>
                <span>
                  Save keeps your work private. Publish updates the event page.
                </span>
              </div>
              <div className="event-inline-actions">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={disabled}
                  onClick={() => setFullPreview(true)}
                >
                  Preview changes
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={disabled || !doc.dirty}
                  onClick={() => void doc.save()}
                >
                  {doc.busy ? "Saving…" : "Save draft"}
                </button>
                {event.canPublish && (
                  <button
                    type="button"
                    className="button button-accent"
                    disabled={disabled}
                    onClick={() => void doc.publish()}
                  >
                    Publish changes
                  </button>
                )}
              </div>
            </div>
            <nav className="event-designer-tabs" aria-label="Page design tools">
              {[
                ["content", "Content"],
                ["layout", "Page layout"],
                ["appearance", "Theme & appearance"],
                ["settings", "Page settings"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
              {event.moduleKey === "website" && (
                <button
                  type="button"
                  disabled={disabled || doc.draft.data.content.length > 70}
                  onClick={() => setChoosingLayout(true)}
                >
                  Choose a layout
                </button>
              )}
              <button
                type="button"
                className="event-preview-toggle"
                aria-pressed={showPreview}
                onClick={() => setShowPreview((value) => !value)}
              >
                <Icon name="desktop" />
                {showPreview ? "Hide live preview" : "Show live preview"}
              </button>
            </nav>
            {(doc.error || workspaceError) && (
              <Notice>
                {doc.error || workspaceError}
                {workspaceError && (
                  <button className="inline-button" onClick={refresh}>
                    Try again
                  </button>
                )}
              </Notice>
            )}
            {doc.message && <Notice kind="success">{doc.message}</Notice>}
            {doc.readOnly && (
              <Notice>
                {event.readOnlyReason ||
                  "This page is archived and cannot be edited."}
              </Notice>
            )}
            {undo && (
              <div className="event-builder-undo" role="status">
                Page layout changed.{" "}
                <button
                  type="button"
                  className="inline-button"
                  disabled={disabled}
                  onClick={() => {
                    updateData(undo);
                    setUndo(undefined);
                  }}
                >
                  Undo layout change
                </button>
              </div>
            )}
            <div
              className={`event-builder-grid${showPreview ? " with-preview" : ""}${tab !== "content" ? " without-outline" : ""}`}
            >
              {tab === "content" && (
                <fieldset
                  disabled={disabled}
                  className="event-builder-outline-fieldset"
                >
                  <EventSectionOutline
                    data={doc.draft.data}
                    selected={panel}
                    select={select}
                    move={move}
                    add={() => setAdding(true)}
                  />
                </fieldset>
              )}
              <fieldset className="event-page-fieldset" disabled={disabled}>
                {tab === "content" &&
                  (selected ? (
                    <section
                      className="event-page-panel"
                      aria-label={`${sectionLabel(selected.type)} editor`}
                    >
                      <header>
                        <p className="eyebrow">{sectionLabel(selected.type)}</p>
                        <h2>{eventSectionTitle(selected)}</h2>
                        <div className="event-selected-actions">
                          <label className="event-visibility">
                            <input
                              type="checkbox"
                              checked={!hidden.includes(selected.props.id)}
                              onChange={(e) =>
                                toggle(selected.props.id, e.target.checked)
                              }
                            />
                            Show {sectionLabel(selected.type)}
                          </label>
                          <ActionsMenu
                            key={selected.props.id}
                            label="Section actions"
                            disabled={disabled}
                          >
                            <button
                              type="button"
                              disabled={doc.draft.data.content.length >= 80}
                              onClick={duplicate}
                            >
                              <Icon name="duplicate" />
                              Duplicate section
                            </button>
                            <button type="button" onClick={remove}>
                              <Icon name="trash" />
                              Remove section
                            </button>
                          </ActionsMenu>
                        </div>
                      </header>
                      {hidden.includes(selected.props.id) && (
                        <Notice>
                          This section is hidden from visitors. Its content is
                          kept.
                        </Notice>
                      )}
                      {selected.type === "EventHero" && (
                        <p className="field-help">
                          The name, description, date and venue come from Event
                          details. Style the invitation here.
                        </p>
                      )}
                      {selected.type === "EventPractical" && (
                        <p className="field-help">
                          Date and venue stay in sync with Event details. Add
                          travel and access information below.
                        </p>
                      )}
                      {selected.type === "EventImpact" && (
                        <p className="field-help">
                          These are your published project descriptions. Figures
                          are entered by you; no payment totals are calculated.
                        </p>
                      )}
                      {[
                        "EventPackages",
                        "EventPrizes",
                        "EventWinners",
                      ].includes(selected.type) && (
                        <p className="field-help">
                          Edit the collection in{" "}
                          <Link
                            href={`/admin/events/${event.id}?tab=${selected.type === "EventPackages" ? "packages" : "prizes"}`}
                          >
                            {selected.type === "EventPackages"
                              ? "Packages"
                              : "Prizes"}
                          </Link>
                          . This section controls where it appears.
                        </p>
                      )}
                      <EventSectionFields
                        key={selected.props.id}
                        block={selected}
                        sectionLinks={eventPageNavigation(doc.draft.data)}
                        onChange={(next) =>
                          updateData({
                            ...doc.draft.data,
                            content: doc.draft.data.content.map((block) =>
                              block.props.id === next.props.id ? next : block,
                            ),
                          })
                        }
                      />
                    </section>
                  ) : (
                    <section className="event-page-panel event-builder-empty">
                      <Icon name="website" />
                      <h2>Make this event your own</h2>
                      <p>
                        Start with a complete event layout or add your first
                        section.
                      </p>
                      <button
                        type="button"
                        className="button button-accent"
                        onClick={() => setAdding(true)}
                      >
                        Add a section
                      </button>
                    </section>
                  ))}
                {tab === "layout" && (
                  <EventPageLayout
                    data={doc.draft.data}
                    change={updateData}
                    edit={select}
                    add={() => setAdding(true)}
                  />
                )}
                {tab === "appearance" && (
                  <EventPageAppearance
                    design={
                      doc.draft.data.root.props.eventDesign ??
                      defaultEventDesign
                    }
                    change={(design) =>
                      updateData({
                        ...doc.draft.data,
                        root: {
                          props: {
                            ...doc.draft.data.root.props,
                            eventLayout: "standalone",
                            eventDesign: design,
                          },
                        },
                      })
                    }
                  />
                )}
                {tab === "settings" && (
                  <EventPageSettings
                    event={event}
                    draft={doc.draft}
                    change={doc.change}
                    pageId={initial.id}
                    locale={initial.locale}
                  />
                )}
              </fieldset>
              {(showPreview || fullPreview) && active && (
                <UnsavedPreview
                  inline
                  fullScreen={fullPreview}
                  onFullScreenChange={setFullPreview}
                  endpoint={`${doc.base}/preview`}
                  payload={doc.payload}
                  focusId={
                    !fullPreview && tab === "content" && selected
                      ? eventSectionAnchor(selected.props.id)
                      : undefined
                  }
                />
              )}
            </div>
            {adding && (
              <EventSectionLibrary
                available={doc.draft.data.content.length >= 80 ? [] : available}
                add={add}
                onClose={() => setAdding(false)}
                applyLayout={
                  event.moduleKey === "website" &&
                  doc.draft.data.content.length <= 70
                    ? () => {
                        setAdding(false);
                        setChoosingLayout(true);
                      }
                    : undefined
                }
              />
            )}
            {choosingLayout && (
              <EventLayoutPicker
                preserving
                onClose={() => setChoosingLayout(false)}
                onSelect={applyLayout}
              />
            )}
          </div>
        </EditorLocale>
      </EventEditorScope>
    </MediaPickerScope>
  );
}

export function EventPageEditor({
  eventId,
  pageId,
  locale,
  locked = false,
  active = true,
  onDirtyChange,
  onEventSaved,
}: {
  eventId: string;
  pageId: string;
  locale: string;
  locked?: boolean;
  active?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onEventSaved?: (event: EventDraft) => void;
}) {
  const { data, error, refresh } = useResource<CmsDetail>(
    `/api/admin/cms/content/${pageId}?locale=${encodeURIComponent(locale)}`,
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    );
  if (!data) return <Loading />;
  if (!data.event || data.event.id !== eventId)
    return <Notice>This page does not belong to this event.</Notice>;
  return (
    <EventPageForm
      key={`${pageId}:${locale}`}
      initial={data}
      locked={locked}
      active={active}
      onDirtyChange={onDirtyChange}
      onEventSaved={onEventSaved}
    />
  );
}
