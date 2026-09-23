"use client";

import {
  createUsePuck,
  registerOverlayPortal,
  type Overrides,
} from "@puckeditor/core";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Block } from "../cms_schemas";
import { Icon as EditorIcon } from "@/ui/icon";
import type { puckConfig } from "./puck-config";

type InsertionRequest = (index: number, type?: Block["type"]) => void;
type InsertionContextValue = { onInsert: InsertionRequest; disabled: boolean };
const InsertionContext = createContext<InsertionContextValue | null>(null);
const useInsertionPuck = createUsePuck<typeof puckConfig>();

export function useEditorInsertion() {
  return useContext(InsertionContext);
}

/** The owning workspace opens its block picker at the requested current index. */
export function InsertionProvider({
  children,
  onInsert,
  disabled = false,
}: {
  children: ReactNode;
  onInsert: InsertionRequest;
  disabled?: boolean;
}) {
  const value = useMemo(() => ({ onInsert, disabled }), [onInsert, disabled]);
  return (
    <InsertionContext.Provider value={value}>
      {children}
    </InsertionContext.Provider>
  );
}

type BoundaryOverlayProps = Parameters<
  Overrides<typeof puckConfig>["componentOverlay"]
>[0];

/** Keep Puck's overlay as a direct child so its selection/hover styles still apply. */
export function BoundaryOverlay({
  children,
  hover,
  isSelected,
  componentId,
  componentType,
}: BoundaryOverlayProps) {
  const insertion = useContext(InsertionContext);
  const index = useInsertionPuck((state) =>
    state.appState.data.content.findIndex(
      (block) => block.props.id === componentId,
    ),
  );
  const isDragging = useInsertionPuck((state) => state.appState.ui.isDragging);

  if (!insertion || index < 0) return <>{children}</>;
  const disabled = insertion.disabled || isDragging;
  return (
    <>
      {children}
      <div
        className="editor-insertion-boundaries"
        data-active={hover || isSelected || undefined}
        data-dragging={isDragging || undefined}
      >
        {(["before", "after"] as const).map((position) => (
          <BoundaryButton
            key={position}
            position={position}
            componentType={componentType}
            disabled={disabled}
            onInsert={() =>
              insertion.onInsert(index + (position === "after" ? 1 : 0))
            }
          />
        ))}
      </div>
    </>
  );
}

function BoundaryButton({
  position,
  componentType,
  disabled,
  onInsert,
}: {
  position: "before" | "after";
  componentType: string;
  disabled: boolean;
  onInsert: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Register only the small button. A portal covering the whole overlay would
    // intercept clicks intended for native inline text editing underneath it.
    return registerOverlayPortal(button.current, { disableDrag: true });
  }, []);
  return (
    <div
      className={`editor-insertion-boundary editor-insertion-boundary--${position}`}
    >
      <button
        ref={button}
        type="button"
        className="editor-insertion-button"
        aria-label={`Add block ${position} ${componentType}`}
        title={`Add block ${position} ${componentType}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onInsert();
        }}
      >
        <EditorIcon name="plus" />
      </button>
    </div>
  );
}

/** An always-visible canvas entry point, including when the document is empty. */
export function CanvasAddBlock({
  label = "Add block",
  atStart = false,
  type,
}: {
  label?: string;
  atStart?: boolean;
  type?: Block["type"];
}) {
  const insertion = useContext(InsertionContext);
  const length = useInsertionPuck(
    (state) => state.appState.data.content.length,
  );
  if (!insertion) return null;
  return (
    <button
      type="button"
      className="editor-canvas-add-block"
      disabled={insertion.disabled}
      onClick={() => insertion.onInsert(atStart ? 0 : length, type)}
    >
      <EditorIcon name={type === "Image" ? "image" : "plus"} />
      <span>{label}</span>
    </button>
  );
}
