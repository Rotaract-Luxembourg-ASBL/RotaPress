"use client";

import { clubDetailLabels } from "../club_details";
import type { BlockProps } from "./block-renderers";
import { useSitePart } from "./site-part-blocks";

export function ClubDetailsBlock(props: BlockProps<"ClubDetails">) {
  const { club } = useSitePart();
  const items = props.fields.flatMap(({ field }) => {
    const value =
      field === "name" || field === "tagline" || field === "description"
        ? club?.[field]
        : club?.profile[field];
    return value ? [{ field, value }] : [];
  });
  return (
    <section className={`cms-block club-details club-details-${props.layout}`}>
      {props.title && <h2>{props.title}</h2>}
      <dl>
        {items.map(({ field, value }) => (
          <div key={field}>
            {props.showLabels && <dt>{clubDetailLabels[field]}</dt>}
            <dd>
              {field.endsWith("Url") ? (
                <a href={value}>{clubDetailLabels[field]}</a>
              ) : field === "publicEmail" ? (
                <a href={`mailto:${value}`}>{value}</a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
