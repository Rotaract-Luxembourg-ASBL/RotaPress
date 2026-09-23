"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneLabel(zone: string) {
  return zone.replaceAll("_", " ").replaceAll("/", " / ");
}

function searchable(zone: string) {
  return zone
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\s*\/\s*/g, "/");
}

/** Searching never saves a partial or invalid zone. */
export function TimeZonePicker({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (zone: string) => void;
  help?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const zones = useMemo(() => {
    const supported = Intl.supportedValuesOf("timeZone");
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [...new Set([value, device, "UTC", ...supported])].filter(validZone);
  }, [value]);
  const matches = useMemo(() => {
    const search = searchable(query);
    const filtered = zones.filter((zone) => searchable(zone).includes(search));
    // Valid IANA aliases may be absent from the canonical list.
    const exact = query.trim();
    if (exact.includes("/") && validZone(exact) && !filtered.includes(exact))
      filtered.unshift(exact);
    return filtered;
  }, [query, zones]);
  function show() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }
  function choose(zone: string) {
    onChange(zone);
    setOpen(false);
    setQuery("");
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      const next = Math.max(
        0,
        Math.min(
          matches.length - 1,
          active + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === "Tab") setOpen(false);
  }
  return (
    <div
      className="time-zone-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && matches[active] ? `${id}-option-${active}` : undefined
        }
        aria-describedby={help ? `${id}-help` : undefined}
        value={open ? query : timeZoneLabel(value)}
        placeholder="Search a city or region…"
        onFocus={show}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={navigate}
      />
      {open && (
        <div className="time-zone-options">
          <p className="time-zone-hint">
            Choose a time zone · {matches.length}{" "}
            {matches.length === 1 ? "match" : "matches"}
          </p>
          <ul id={`${id}-options`} role="listbox" aria-label={label} ref={list}>
            {matches.map((zone, index) => (
              <li
                key={zone}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={zone === value}
                className={index === active ? "is-active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(zone)}
              >
                <span>{timeZoneLabel(zone)}</span>
                {zone === value && <span aria-hidden="true">✓</span>}
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p role="status">
              No matching zone. Try a city such as Sydney or Beirut.
            </p>
          )}
        </div>
      )}
      {help && (
        <p className="field-help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}
