"use client";
import { useEditorPuck } from "./editor-blocks";
import { blockDesignSchema, designOptions } from "../block_design";

export function BlockDesignPanel() {
  const selected = useEditorPuck((state) => state.selectedItem);
  const selector = useEditorPuck((state) => state.appState.ui.itemSelector);
  const dispatch = useEditorPuck((state) => state.dispatch);
  if (!selected || !selector) return null;
  const design = selected.props.design ?? {};
  function update(next: unknown) {
    if (!selected || !selector) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone ?? "root:default-zone",
      data: {
        ...selected,
        props: { ...selected.props, design: blockDesignSchema.parse(next) },
      },
    });
  }
  return (
    <div className="form-stack editor-design-fields">
      <p className="field-help">
        Style this section. Theme defaults remain shared; only your overrides
        are saved. Content stays the same when you change themes.
      </p>
      {Object.entries(designOptions)
        .filter(
          ([key]) =>
            key !== "columns" ||
            [
              "Cards",
              "Team",
              "Sponsors",
              "PartnerCollection",
              "Gallery",
              "ParticipationOptions",
              "EventCollection",
              "ProjectCollection",
            ].includes(selected.type),
        )
        .map(([key, setting]) => (
          <label key={key}>
            {setting.label}
            <select
              value={design[key as keyof typeof design] ?? ""}
              onChange={(event) => {
                const next = { ...design };
                delete next[key as keyof typeof design];
                update(
                  event.target.value
                    ? { ...next, [key]: event.target.value }
                    : next,
                );
              }}
            >
              <option value="">Theme / block default</option>
              {Object.entries(setting.choices).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      <button
        className="button button-outline"
        type="button"
        onClick={() => update({})}
      >
        Reset design overrides
      </button>
    </div>
  );
}
