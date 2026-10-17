"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormCollection } from "../form_collection";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import { Icon } from "@/ui/icon";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
  UpdatedDate,
} from "@/ui/collection";
import { FormArchiveAction, formArchiveMessage } from "./form-archive-action";
import { FormCreatePanel } from "./form-create-panel";
import { isContentElement } from "../form_elements";

export function FormList() {
  const user = useCurrentUser();
  const { params, change, page } = useCollectionLocation();
  const returnQuery = params.size
    ? `?returnTo=${encodeURIComponent(`/admin/forms?${params}`)}`
    : "";
  const view =
    ["active", "published", "draft", "archived"].find(
      (value) => value === params.get("status"),
    ) ?? "active";
  const kind =
    ["contact", "membership"].find((value) => value === params.get("kind")) ??
    "all";
  const sort =
    ["name", "responses"].find((value) => value === params.get("sort")) ??
    "updated";
  const query = (params.get("search") ?? "").slice(0, 160);
  const setView = (status: string) => change({ status });
  const setKind = (kind: string) => change({ kind });
  const setSort = (sort: string) => change({ sort });
  const setQuery = (search: string) => change({ search });
  const { data, error, refresh } = useResource<FormCollection>(
    `/api/admin/forms?${new URLSearchParams({ status: view, kind, sort, search: query, page: String(page) })}`,
  );
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const forms = data?.forms ?? [];
  const counts = data?.counts ?? {
    all: 0,
    active: 0,
    published: 0,
    draft: 0,
    archived: 0,
  };
  const visible = forms;
  function clear() {
    change({ search: "", kind: "", status: "active", sort: "" });
  }
  if (!user.capabilities.includes("forms.edit"))
    return <Notice>You do not have permission to manage forms.</Notice>;
  return (
    <div className="form-dashboard">
      <PageHeading
        title="Forms"
        description="Create a form, share it with your community and keep every response in one place."
      >
        <div className="forms-actions">
          {user.capabilities.includes("submissions.read") && (
            <Link href="/admin/inbox" className="button button-outline">
              <Icon name="mail" />
              Response center
            </Link>
          )}
          <button
            className="button button-accent"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" />
            New form
          </button>
        </div>
      </PageHeading>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {data && (
        <SummaryStats
          label="Form counts"
          items={[
            {
              label: "Active forms",
              value: counts.active,
              hint: "Ready to edit or share",
              icon: "forms",
              onClick: () => setView("active"),
              selected: view === "active",
            },
            {
              label: "Published",
              value: counts.published,
              hint: "Have a published version",
              icon: "check",
              onClick: () => setView("published"),
              selected: view === "published",
            },
            {
              label: "Drafts",
              value: counts.draft,
              hint: "Not published yet",
              icon: "edit",
              onClick: () => setView("draft"),
              selected: view === "draft",
            },
            {
              label: "Archived",
              value: counts.archived,
              hint: "Responses are retained",
              icon: "archive",
              onClick: () => setView("archived"),
              selected: view === "archived",
            },
          ]}
        />
      )}
      <Collection
        label="Your forms"
        noun="Form"
        detailLabel="Last updated"
        toolbar={
          <>
            <FilterTabs
              label="Filter forms by status"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "active",
                  label: "All active",
                  count: data ? counts.active : undefined,
                },
                {
                  value: "published",
                  label: "Published",
                  count: data ? counts.published : undefined,
                },
                {
                  value: "draft",
                  label: "Drafts",
                  count: data ? counts.draft : undefined,
                },
                {
                  value: "archived",
                  label: "Archived",
                  count: data ? counts.archived : undefined,
                },
              ]}
            />
            <CollectionToolbar
              searchLabel="Search forms"
              query={query}
              onQuery={setQuery}
            >
              <select
                aria-label="Form type"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="contact">Website forms</option>
                <option value="membership">Membership</option>
              </select>
              <select
                aria-label="Sort forms"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name A–Z</option>
                {user.capabilities.includes("submissions.read") && (
                  <option value="responses">Most responses</option>
                )}
              </select>
              {(query || kind !== "all") && (
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
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              noun="forms"
              onPage={(page) => change({ page }, false)}
            />
          )
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {visible.map((form) => (
                <CollectionRow
                  key={form.id}
                  icon={<Icon name="forms" />}
                  title={
                    <Link href={`/admin/forms/${form.id}${returnQuery}`}>
                      {form.draft.title}
                    </Link>
                  }
                  description={
                    <>
                      <span>
                        {form.kind === "membership"
                          ? "Membership application"
                          : "Website form"}{" "}
                        ·{" "}
                        {
                          form.draft.fields.filter(
                            (field) => !isContentElement(field.type),
                          ).length
                        }{" "}
                        questions ·{" "}
                        {1 +
                          form.draft.fields.filter(
                            (field) => field.type === "page_break",
                          ).length}{" "}
                        {form.draft.fields.some(
                          (field) => field.type === "page_break",
                        )
                          ? "pages"
                          : "page"}
                      </span>
                      {form.responses && (
                        <span>
                          {form.responses.total} responses ·{" "}
                          {form.responses.new} new
                        </span>
                      )}
                    </>
                  }
                  status={
                    <StatusBadge
                      tone={
                        form.archived
                          ? "neutral"
                          : form.publishedVersionId
                            ? "success"
                            : "warning"
                      }
                    >
                      {form.archived
                        ? "Archived"
                        : form.publishedVersionId
                          ? form.publishedVersionNumber !== form.draftRevision
                            ? "Unpublished changes"
                            : "Published"
                          : "Draft"}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Updated",
                    value: <UpdatedDate value={form.updatedAt} />,
                  }}
                  actions={
                    <>
                      {user.capabilities.includes("submissions.read") && (
                        <Link
                          className="text-link"
                          href={`/admin/inbox?formId=${form.id}`}
                        >
                          Responses
                        </Link>
                      )}
                      <Link
                        className="button button-outline"
                        href={`/admin/forms/${form.id}${returnQuery}`}
                      >
                        {form.archived ? "View" : "Edit form"}
                      </Link>
                      <FormArchiveAction
                        form={form}
                        onDeleted={() => {
                          setMessage("Form permanently deleted.");
                          refresh();
                        }}
                        onChanged={(next) => {
                          setMessage(formArchiveMessage(next));
                          refresh();
                        }}
                      />
                    </>
                  }
                />
              ))}
            </ul>
            {!visible.length && (
              <CollectionEmpty
                icon={view === "archived" ? "archive" : "forms"}
                title={
                  !counts.all
                    ? "Start with your first form"
                    : "No forms to show"
                }
                description={
                  !counts.all
                    ? "Choose a template, make it yours, then share a link or add it to your website."
                    : view === "archived"
                      ? "Archived forms appear here. Their existing responses are kept."
                      : "Try another search or change the status and type filters."
                }
              >
                {!counts.all ? (
                  <button
                    className="button button-accent"
                    onClick={() => setCreating(true)}
                  >
                    Create your first form
                  </button>
                ) : (
                  <button className="button button-outline" onClick={clear}>
                    Clear filters
                  </button>
                )}
              </CollectionEmpty>
            )}
          </>
        )}
      </Collection>
      {creating && <FormCreatePanel onClose={() => setCreating(false)} />}
    </div>
  );
}
