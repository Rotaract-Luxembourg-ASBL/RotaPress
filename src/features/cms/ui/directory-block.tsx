"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Config } from "@puckeditor/core";
import { useResource } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import { useMediaPickerEvent } from "@/ui/media-picker-scope";
import type { PublicPartner } from "../../partners/partner_schemas";
import { PartnerCollection } from "../../partners/ui/partner-collection";
import { selectProfiles } from "../../partners/collection_selection";
import type { PuckBlocks } from "./puck-config";

function usePartners() {
  const eventId = useMediaPickerEvent();
  const resource = useResource<{ items: PublicPartner[] }>(
    `/api/admin/partners/selection${eventId ? `?eventId=${eventId}` : ""}`,
  );
  const { refresh } = resource;
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return resource;
}

export function PartnerPicker({
  value,
  onChange,
  disabled,
  initialCategory = "all",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  initialCategory?: string;
}) {
  const { data, error } = usePartners();
  const { capabilities } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const items =
    data?.items.filter(
      (item) =>
        (category === "all" || category === item.category) &&
        item.name.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  function move(index: number, delta: number) {
    const next = [...value];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }
  return (
    <div className="form-stack directory-picker">
      <p className="field-help">
        Selected profiles stay connected to their published names, images and
        descriptions. Arrange their display order here.
      </p>
      {error && <p role="alert">{error}</p>}
      {value.map((id, index) => (
        <div className="directory-selected" key={id}>
          <strong>
            {index + 1}.{" "}
            {data?.items.find((item) => item.id === id)?.name ??
              "Unavailable profile — selection retained"}
          </strong>
          <div className="cms-actions">
            <button
              type="button"
              disabled={disabled || !index}
              onClick={() => move(index, -1)}
              aria-label={`Move profile ${index + 1} up`}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || index === value.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move profile ${index + 1} down`}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item !== id))}
            >
              Remove from block
            </button>
          </div>
        </div>
      ))}
      <label>
        Filter directory
        <select
          value={category}
          disabled={disabled}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All profiles</option>
          <option value="partner">Partners</option>
          <option value="sponsor">Sponsors</option>
          <option value="team">Team</option>
        </select>
      </label>
      <label>
        Search profiles
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        Add a published profile
        <select
          value=""
          disabled={disabled || value.length >= 40}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">Choose a profile</option>
          {items
            .filter((item) => !value.includes(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.category}
              </option>
            ))}
        </select>
      </label>
      {data && !items.length && (
        <p className="field-help">
          No published profiles match. Publish a profile in the community
          directory to make it available here.
        </p>
      )}
      {capabilities.includes("cms.edit") && (
        <Link href="/admin/partners" target="_blank" className="text-link">
          Manage community directory ↗
        </Link>
      )}
    </div>
  );
}

function PartnerPreview(props: PuckBlocks["PartnerCollection"]) {
  const { data, error } = usePartners();
  const items = selectProfiles(props, data?.items ?? []);
  return (
    <>
      <PartnerCollection
        title={props.title}
        presentation={props.presentation}
        items={items}
      />
      {(error || !items.length) && (
        <p className="cms-block field-help">
          {error ||
            (props.selectionMode === "category"
              ? "Published profiles in this category will appear automatically. Private drafts stay hidden."
              : "Choose specific profiles in Content settings.")}
        </p>
      )}
      {props.selectionMode === "category" && items.length > 0 && (
        <p className="cms-block field-help">
          Automatic category · new publications appear here, up to 40 profiles.
        </p>
      )}
    </>
  );
}

export const partnerBlockConfig: Config<PuckBlocks>["components"]["PartnerCollection"] =
  {
    label: "Directory profiles",
    fields: {
      version: { type: "custom", visible: false, render: () => <></> },
      title: { type: "text", label: "Section heading" },
      selectionMode: {
        type: "radio",
        label: "Content source",
        options: [
          { label: "Choose specific profiles", value: "selected" },
          { label: "Automatic category", value: "category" },
        ],
      },
      category: {
        type: "select",
        label: "Category to display",
        options: [
          { label: "All categories", value: "all" },
          { label: "Partners", value: "partner" },
          { label: "Sponsors", value: "sponsor" },
          { label: "Team", value: "team" },
        ],
      },
      partnerIds: {
        type: "custom",
        label: "Selected profiles",
        render: ({ value, onChange, readOnly }) => (
          <PartnerPicker
            value={value}
            onChange={onChange}
            disabled={readOnly}
          />
        ),
      },
      presentation: {
        type: "radio",
        label: "Display",
        options: [
          { label: "Logo wall", value: "logos" },
          { label: "Profile cards", value: "cards" },
        ],
      },
    },
    resolveFields: (data, { fields }) => ({
      ...fields,
      ...(data.props.selectionMode === "category"
        ? {
            partnerIds: { type: "custom", visible: false, render: () => <></> },
          }
        : {
            category: { type: "custom", visible: false, render: () => <></> },
          }),
    }),
    defaultProps: {
      version: 1,
      title: "Our community",
      selectionMode: "selected",
      category: "all",
      partnerIds: [],
      presentation: "cards",
    },
    render: (props) => <PartnerPreview {...props} />,
  };
