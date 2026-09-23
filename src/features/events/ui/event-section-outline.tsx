"use client";
import type { CmsData } from "@/features/cms/cms_schemas";
import { Icon } from "@/ui/icon";
import { eventSectionTitle } from "../event_sections";
import { sectionLabel } from "./event-section-fields";

export function EventSectionOutline({
  data,
  selected,
  select,
  move,
  add,
}: {
  data: CmsData;
  selected: string;
  select: (id: string) => void;
  move: (index: number, direction: number) => void;
  add: () => void;
}) {
  const hidden = data.root.props.eventHiddenSections ?? [];
  return (
    <nav className="event-builder-outline" aria-label="Event page editor">
      <div className="event-builder-outline-heading">
        <strong>Page sections</strong>
        <span>{data.content.length}</span>
      </div>
      <p>Edit a section. Use the arrows to change its position.</p>
      <ol>
        {data.content.map((block, index) => (
          <li
            key={block.props.id}
            data-selected={selected === block.props.id}
            data-hidden={hidden.includes(block.props.id)}
          >
            <button
              type="button"
              className="event-outline-select"
              aria-current={selected === block.props.id ? "page" : undefined}
              aria-label={`Edit ${sectionLabel(block.type)}${hidden.includes(block.props.id) ? " (hidden)" : ""}`}
              onClick={() => select(block.props.id)}
            >
              <span className="event-outline-number">{index + 1}</span>
              <span>
                <strong>{eventSectionTitle(block)}</strong>
                <small>
                  {hidden.includes(block.props.id) ? "Hidden · " : ""}
                  {sectionLabel(block.type)}
                </small>
              </span>
            </button>
            <div className="event-outline-move">
              <button
                type="button"
                aria-label={`Move ${sectionLabel(block.type)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <Icon name="up" />
              </button>
              <button
                type="button"
                aria-label={`Move ${sectionLabel(block.type)} down`}
                disabled={index === data.content.length - 1}
                onClick={() => move(index, 1)}
              >
                <Icon name="down" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="button button-outline" onClick={add}>
        <Icon name="plus" /> Add section
      </button>
    </nav>
  );
}
