"use client";

import { AutoField, Puck, type RichtextField } from "@puckeditor/core";
import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type FocusEvent,
} from "react";

const fieldContext = { components: {} };
const emptyDocument = { content: [] };

/** Puck's rich-text field needs a live focus store even without its canvas UI. */
export function EventRichTextField({
  field,
  value,
  onChange,
}: {
  field: RichtextField;
  value: string;
  onChange: (value: string) => void;
}) {
  const notify = useRef(onChange);
  const lastValue = useRef(value);
  useEffect(() => {
    notify.current = onChange;
    lastValue.current = value;
  }, [onChange, value]);
  // Puck replays its debounced update when callback identity changes. Keep it
  // stable and ignore echoes of a value already captured by input or blur.
  const commit = useCallback((html: string) => {
    if (html === lastValue.current) return;
    lastValue.current = html;
    notify.current(html);
  }, []);
  function flush(
    event: FormEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>,
  ) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editable = target.closest<HTMLElement>('[contenteditable="true"]');
    if (
      editable &&
      event.currentTarget.contains(editable) &&
      editable.innerHTML !== value
    ) {
      commit(editable.innerHTML);
    }
  }
  return (
    <div onInput={flush} onBlur={flush}>
      <Puck
        config={fieldContext}
        data={emptyDocument}
        iframe={{ enabled: false }}
      >
        <AutoField<string> field={field} value={value} onChange={commit} />
      </Puck>
    </div>
  );
}
