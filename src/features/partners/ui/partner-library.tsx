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
import type { PartnerDto, PartnerProfile } from "../partner_schemas";

const categories = [
  { value: "all", label: "All profiles" },
  { value: "partner", label: "Partners" },
  { value: "sponsor", label: "Sponsors" },
  { value: "team", label: "Team" },
] as const;

export function PartnerLibrary() {
  const [category, setCategory] = useState<"all" | PartnerProfile["category"]>(
    "all",
  );
  const { data, error, refresh } = useResource<{ items: PartnerDto[] }>(
    "/api/admin/partners",
  );
  const [editing, setEditing] = useState<PartnerDto | null | undefined>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const profiles = data?.items ?? [];
  const categoryProfiles = profiles.filter(
    (item) => category === "all" || item.draft.category === category,
  );
  const items = categoryProfiles.filter(
    (item) =>
      (status === "all" ||
        (status === "draft"
          ? !item.published
          : status === "published"
            ? Boolean(item.published)
            : Boolean(item.published) && item.changed)) &&
      `${item.draft.name} ${item.draft.category} ${item.draft.role ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  function clear() {
    setQuery("");
    setStatus("all");
    setCategory("all");
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
              value: categoryProfiles.length,
              hint: "In the selected category",
              icon: "members",
              onClick: () => setStatus("all"),
              selected: status === "all",
            },
            {
              label: "Published",
              value: categoryProfiles.filter((item) => item.published).length,
              hint: "Available to use in blocks",
              icon: "check",
              onClick: () => setStatus("published"),
              selected: status === "published",
            },
            {
              label: "Drafts",
              value: categoryProfiles.filter((item) => !item.published).length,
              hint: "Not published yet",
              icon: "edit",
              onClick: () => setStatus("draft"),
              selected: status === "draft",
            },
            {
              label: "Unpublished changes",
              value: categoryProfiles.filter(
                (item) => item.published && item.changed,
              ).length,
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
                count: data
                  ? profiles.filter(
                      (profile) =>
                        item.value === "all" ||
                        profile.draft.category === item.value,
                    ).length
                  : undefined,
              }))}
            />
            <CollectionToolbar
              searchLabel="Search profiles"
              query={query}
              onQuery={setQuery}
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
          data &&
          `${items.length} of ${profiles.length} profiles shown · Publishing a profile updates its selected placements.`
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
                  profiles.length
                    ? "No matching profiles"
                    : "Your shared library starts here"
                }
                description={
                  profiles.length
                    ? "Try another category, status or search."
                    : "Add a partner, sponsor or team member. Publish the profile to make it available in website and event blocks."
                }
              >
                {profiles.length ? (
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
