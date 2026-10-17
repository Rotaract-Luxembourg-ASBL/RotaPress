"use client";

export type MediaInspectorTab = "details" | "organize" | "usage";
const tabs = [
  { id: "details", label: "Details" },
  { id: "organize", label: "Organize" },
  { id: "usage", label: "Usage" },
] as const;

export function MediaInspectorTabs({
  value,
  onChange,
  prefix,
}: {
  value: MediaInspectorTab;
  onChange: (value: MediaInspectorTab) => void;
  prefix: string;
}) {
  return (
    <div
      className="media-inspector-tabs"
      role="tablist"
      aria-label="Attachment information"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${prefix}-${tab.id}-tab`}
          aria-controls={`${prefix}-${tab.id}-panel`}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            event.stopPropagation();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      tabs.length) %
                    tabs.length;
            onChange(tabs[next].id);
            document.getElementById(`${prefix}-${tabs[next].id}-tab`)?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
