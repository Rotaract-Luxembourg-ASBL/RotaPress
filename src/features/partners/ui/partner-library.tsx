"use client";
import { useState } from "react";
import { useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { Icon } from "@/ui/icon";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
} from "@/ui/collection";
import { PartnerEditor } from "./partner-editor";
import type { PartnerDto } from "../partner_schemas";
import {
  partnerCollectionSchema,
  type PartnerCollection,
} from "../partner_collection";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";

const categories = [
  { value: "all", label: "All profiles" },
  { value: "partner", label: "Partners" },
  { value: "sponsor", label: "Sponsors" },
  { value: "team", label: "Team" },
] as const;

export function PartnerLibrary() {
  const { params, page, change } = useCollectionLocation();
  const category = partnerCollectionSchema.shape.category
    .catch("all")
    .parse(params.get("category") ?? "all");
  const query = params.get("search") ?? "";
  const status = params.get("status") ?? "all";
  const setCategory = (value: string) => change({ category: value });
  const setStatus = (value: string) => change({ status: value });
  const { data, error, refresh } = useResource<PartnerCollection>(
    `/api/admin/partners?${new URLSearchParams({ page: String(page), search: query, category, status })}`,
  );
  const [editing, setEditing] = useState<PartnerDto | null | undefined>();
  const items = data?.items ?? [];
  function clear() {
    change({ search: undefined, status: "all", category: "all" });
  }
  return (
    <>
      <PageHeading
        title="Community directory"
        description="Manage partners, sponsors and team profiles, then reuse them across your website and events."
      >
        <button
          className="button button-accent"
          onClick={() => setEditing(null)}
        >
          <Icon name="plus" />
          New profile
        </button>
      </PageHeading>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {data && (
        <SummaryStats
          label="Directory counts"
          items={[
            {
              label: "Profiles",
              value: data.counts.all,
              hint: "In the selected category",
              icon: "members",
              onClick: () => setStatus("all"),
              selected: status === "all",
            },
            {
              label: "Published",
              value: data.counts.published,
              hint: "Available to use in blocks",
              icon: "check",
              onClick: () => setStatus("published"),
              selected: status === "published",
            },
            {
              label: "Drafts",
              value: data.counts.draft,
              hint: "Not published yet",
              icon: "edit",
              onClick: () => setStatus("draft"),
              selected: status === "draft",
            },
            {
              label: "Unpublished changes",
              value: data.counts.changes,
              hint: "Published profiles with saved edits",
              icon: "edit",
              onClick: () => setStatus("changes"),
              selected: status === "changes",
            },
          ]}
        />
      )}
      <Collection
        label="Directory profiles"
        noun="Profile"
        detailLabel="Used on"
        toolbar={
          <>
            <FilterTabs
              label="Directory categories"
              value={category}
              onChange={setCategory}
              options={categories.map((item) => ({
                ...item,
                count: data?.categories[item.value],
              }))}
            />
            <CollectionToolbar
              searchLabel="Search profiles"
              query={query}
              onQuery={(search) => change({ search })}
            >
              <select
                aria-label="Profile status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
                <option value="changes">Unpublished changes</option>
              </select>
              {(query || status !== "all" || category !== "all") && (
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
              noun="profiles"
              onPage={(next) => change({ page: next }, false)}
            />
          )
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {items.map((item) => (
                <CollectionRow
                  key={item.id}
                  icon={<Icon name="members" />}
                  title={
                    <button
                      className="inline-button"
                      onClick={() => setEditing(item)}
                    >
                      {item.draft.name}
                    </button>
                  }
                  description={
                    item.draft.category === "team"
                      ? item.draft.role || "Team member"
                      : item.draft.category === "partner"
                        ? "Partner"
                        : "Sponsor"
                  }
                  status={
                    <StatusBadge
                      tone={
                        !item.published || item.changed ? "warning" : "success"
                      }
                    >
                      {!item.published
                        ? "Draft"
                        : item.changed
                          ? "Unpublished changes"
                          : "Published"}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Used on",
                    value: `${item.placements.length} published placements`,
                  }}
                  actions={
                    <button
                      className="button button-outline"
                      onClick={() => setEditing(item)}
                    >
                      Edit profile
                    </button>
                  }
                />
              ))}
            </ul>
            {!items.length && (
              <CollectionEmpty
                icon="members"
                title={
                  data.categories.all
                    ? "No matching profiles"
                    : "Your shared library starts here"
                }
                description={
                  data.categories.all
                    ? "Try another category, status or search."
                    : "Add a partner, sponsor or team member. Publish the profile to make it available in website and event blocks."
                }
              >
                {data.categories.all ? (
                  <button className="button button-outline" onClick={clear}>
                    Clear filters
                  </button>
                ) : (
                  <button
                    className="button button-accent"
                    onClick={() => setEditing(null)}
                  >
                    Create your first profile
                  </button>
                )}
              </CollectionEmpty>
            )}
          </>
        )}
      </Collection>
      {editing !== undefined && (
        <PartnerEditor
          category={category === "all" ? "partner" : category}
          initial={editing}
          close={() => setEditing(undefined)}
          changed={refresh}
        />
      )}
    </>
  );
}
