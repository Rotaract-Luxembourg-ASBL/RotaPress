"use client";
import { useResource } from "@/ui/api";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import { Loading, Notice } from "@/ui/primitives";
import type { CalendarActivityCollection } from "../calendar_collection";
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
  const { params, page, change } = useCollectionLocation();
  const query = params.get("search") ?? "";
  const view = params.get("status") ?? "active";
  const setView = (status: string) => change({ status });
  const search = new URLSearchParams({
    page: String(page),
    search: query,
    status: view,
  });
  if (calendar) search.set("calendarId", calendar.id);
  const { data, error, refresh } = useResource<CalendarActivityCollection>(
    `/api/admin/calendar/schedules?${search}`,
  );
  const counts = data?.counts ?? {
    all: 0,
    active: 0,
    published: 0,
    draft: 0,
    archived: 0,
  };
  const items = data?.items ?? [];
  function clear() {
    change({ search: undefined, status: "active" });
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
            onQuery={(search) => change({ search })}
          >
            {query && (
              <button className="button button-outline" onClick={clear}>
                Clear filters
              </button>
            )}
          </CollectionToolbar>
        </>
      }
      footer={
        data && (
          <CollectionPagination
            {...data}
            noun="activities"
            onPage={(next) => change({ page: next }, false)}
          />
        )
      }
    >
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
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
      {data && !items.length && (
        <CollectionEmpty
          icon="calendar"
          title={
            counts.all
              ? "No activities match these filters"
              : "No activities yet"
          }
          description={
            counts.all
              ? "Try another search or status."
              : calendar
                ? "Add an activity or import a calendar. Connect published events with Edit calendar."
                : "Choose a calendar to add activities, or create one to group them."
          }
        >
          {counts.all > 0 && (
            <button className="button button-outline" onClick={clear}>
              Clear filters
            </button>
          )}
        </CollectionEmpty>
      )}
    </Collection>
  );
}
