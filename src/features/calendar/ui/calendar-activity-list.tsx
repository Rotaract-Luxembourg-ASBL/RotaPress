"use client";
import { useState } from "react";
import { ActionsMenu } from "@/ui/actions-menu";
import { Icon } from "@/ui/icon";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
} from "@/ui/collection";
import type {
  CalendarRecord,
  CalendarWorkspace,
  ScheduleRecord,
} from "../calendar_schemas";

export function CalendarActivityList({
  workspace,
  calendar,
  busy,
  onEdit,
  onAction,
}: {
  workspace: CalendarWorkspace;
  calendar?: CalendarRecord;
  busy: boolean;
  onEdit: (record: ScheduleRecord) => void;
  onAction: (
    record: ScheduleRecord,
    operation: "publish" | "unpublish" | "archive" | "restore",
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("active");
  const all = workspace.schedules.filter(
    (item) => !calendar || item.calendarId === calendar.id,
  );
  const counts = {
    active: all.filter((item) => !item.archived).length,
    published: all.filter((item) => !item.archived && item.published).length,
    draft: all.filter((item) => !item.archived && !item.published).length,
    archived: all.filter((item) => item.archived).length,
  };
  const items = all.filter(
    (item) =>
      (view === "archived"
        ? item.archived
        : !item.archived &&
          (view === "active" ||
            (view === "draft" ? !item.published : Boolean(item.published)))) &&
      item.draft.title
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  function clear() {
    setQuery("");
    setView("active");
  }
  return (
    <Collection
      label="Activity list"
      noun="Activity"
      detailLabel="Schedule starts"
      toolbar={
        <>
          <FilterTabs
            label="Filter activities by status"
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: "All active", count: counts.active },
              {
                value: "published",
                label: "Published",
                count: counts.published,
              },
              { value: "draft", label: "Drafts", count: counts.draft },
              { value: "archived", label: "Archived", count: counts.archived },
            ]}
          />
          <CollectionToolbar
            searchLabel="Search activities"
            query={query}
            onQuery={setQuery}
          >
            {query && (
              <button className="button button-outline" onClick={clear}>
                Clear filters
              </button>
            )}
          </CollectionToolbar>
        </>
      }
      footer={`${items.length} of ${all.length} activities shown · Repeating schedules count once. Connected events appear in Combined calendar.`}
    >
      <ul className="admin-collection-rows">
        {items.map((item) => {
          const parent = workspace.calendars.find(
            (record) => record.id === item.calendarId,
          );
          const changed =
            Boolean(item.published) &&
            JSON.stringify(item.draft) !== JSON.stringify(item.published);
          const status = item.archived
            ? "Archived"
            : !item.published
              ? "Draft"
              : changed
                ? "Unpublished changes"
                : item.published.cancelled
                  ? "Cancelled"
                  : "Published";
          return (
            <CollectionRow
              key={item.id}
              icon={<Icon name="calendar" />}
              title={item.draft.title}
              description={
                <>
                  {parent?.draft.name} ·{" "}
                  {item.draft.repeat === "once"
                    ? "One-time activity"
                    : `Repeats ${item.draft.repeat}`}
                  {!item.archived &&
                    (!parent?.published || parent.archived) && (
                      <p>Calendar is not published</p>
                    )}
                </>
              }
              status={
                <StatusBadge
                  tone={
                    status === "Published"
                      ? "success"
                      : status === "Cancelled"
                        ? "danger"
                        : status === "Archived"
                          ? "neutral"
                          : "warning"
                  }
                >
                  {status}
                </StatusBadge>
              }
              detail={{
                label: "Starts",
                value: (
                  <>
                    <time dateTime={item.draft.date}>
                      {new Date(
                        `${item.draft.date}T12:00:00Z`,
                      ).toLocaleDateString("en-GB", {
                        timeZone: "UTC",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>{" "}
                    · {item.draft.allDay ? "All day" : item.draft.time}
                    <br />
                    {item.draft.timezone}
                  </>
                ),
              }}
              actions={
                <>
                  {!item.archived && !parent?.archived && (
                    <button
                      className="button button-outline"
                      onClick={() => onEdit(item)}
                    >
                      Edit activity
                    </button>
                  )}
                  <ActionsMenu
                    label={`Activity actions for ${item.draft.title}`}
                    disabled={busy}
                  >
                    {item.archived ? (
                      <button onClick={() => onAction(item, "restore")}>
                        <Icon name="undo" />
                        Restore activity
                      </button>
                    ) : (
                      <>
                        {(!item.published || changed) && !parent?.archived && (
                          <button onClick={() => onAction(item, "publish")}>
                            <Icon name="check" />
                            Publish activity
                          </button>
                        )}
                        {item.published && (
                          <button onClick={() => onAction(item, "unpublish")}>
                            Unpublish activity
                          </button>
                        )}
                        <button
                          className="action-danger"
                          onClick={() => onAction(item, "archive")}
                        >
                          <Icon name="archive" />
                          Archive activity
                        </button>
                      </>
                    )}
                  </ActionsMenu>
                </>
              }
            />
          );
        })}
      </ul>
      {!items.length && (
        <CollectionEmpty
          icon="calendar"
          title={
            all.length
              ? "No activities match these filters"
              : "No activities yet"
          }
          description={
            all.length
              ? "Try another search or status."
              : calendar
                ? "Add an activity or import a calendar. Connect published events with Edit calendar."
                : "Choose a calendar to add activities, or create one to group them."
          }
        >
          {all.length > 0 && (
            <button className="button button-outline" onClick={clear}>
              Clear filters
            </button>
          )}
        </CollectionEmpty>
      )}
    </Collection>
  );
}
