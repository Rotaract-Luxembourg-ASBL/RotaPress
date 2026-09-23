"use client";

import {
  createUsePuck,
  registerOverlayPortal,
  useGetPuck,
} from "@puckeditor/core";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ImageBlock, type BlockProps } from "./block-renderers";
import { useEditorInsertion } from "./editor-insertion";
import type { puckConfig } from "./puck-config";

const useImagePuck = createUsePuck<typeof puckConfig>();
type ResizeGesture = {
  pointerId: number;
  startX: number;
  startWidth: number;
  maximum: number;
  factor: number;
};

export function EditableImage(props: BlockProps<"Image">) {
  const container = useRef<HTMLDivElement>(null);
  const gesture = useRef<ResizeGesture | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const getPuck = useGetPuck();
  const insertion = useEditorInsertion();
  const selected = useImagePuck(
    (state) => state.selectedItem?.props.id === props.id,
  );
  const dragging = useImagePuck((state) => state.appState.ui.isDragging);
  const disabled = insertion?.disabled !== false || dragging;
  const leftHandle = props.alignment === "right";

  function measuredWidth() {
    return (
      container.current
        ?.querySelector(".cms-image-block")
        ?.getBoundingClientRect().width ?? 0
    );
  }

  function maximumWidth() {
    return Math.max(
      40,
      Math.min(2400, Math.floor(container.current?.clientWidth ?? 2400)),
    );
  }

  function commit(width: number) {
    if (disabled) return;
    const { dispatch, getSelectorForId, getItemById } = getPuck();
    const selector = getSelectorForId(props.id);
    const current = getItemById(props.id);
    if (!selector || !current || current.type !== "Image") return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...current, props: { ...current.props, widthPx: width } },
    });
  }

  function nextWidth(clientX: number) {
    const active = gesture.current;
    return active
      ? Math.round(
          Math.max(
            40,
            Math.min(
              active.maximum,
              active.startWidth + (clientX - active.startX) * active.factor,
            ),
          ),
        )
      : null;
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: measuredWidth(),
      maximum: maximumWidth(),
      factor: leftHandle ? -1 : props.alignment === "left" ? 1 : 2,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function cancel() {
    gesture.current = null;
    setPreviewWidth(null);
  }

  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    if (disabled || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const delta =
      (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : 10);
    commit(
      Math.round(
        Math.max(40, Math.min(maximumWidth(), measuredWidth() + delta)),
      ),
    );
  }

  return (
    <div ref={container} className="editor-image-container">
      <ImageBlock
        {...props}
        widthPx={previewWidth ?? props.widthPx}
        controls={
          selected && !disabled && props.assetId ? (
            <>
              <span className="editor-image-size" role="status">
                {(previewWidth ?? props.widthPx)
                  ? `${previewWidth ?? props.widthPx}px`
                  : "Drag to resize"}
              </span>
              {(["edge", "corner"] as const).map((position) => (
                <ResizeHandle
                  key={position}
                  position={position}
                  left={leftHandle}
                  // Puck's overlay portal stops native pointerdown propagation.
                  // React capture runs before it so resizing can claim the pointer.
                  onPointerDownCapture={start}
                  onPointerMove={(event) => {
                    const width = nextWidth(event.clientX);
                    if (width !== null) setPreviewWidth(width);
                  }}
                  onPointerUp={(event) => {
                    const width = nextWidth(event.clientX);
                    if (
                      width !== null &&
                      width !== Math.round(gesture.current?.startWidth ?? width)
                    )
                      commit(width);
                    cancel();
                  }}
                  onPointerCancel={cancel}
                  onLostPointerCapture={cancel}
                  onKeyDown={keyboard}
                />
              ))}
            </>
          ) : undefined
        }
      />
    </div>
  );
}

function ResizeHandle({
  position,
  left,
  ...events
}: {
  position: "edge" | "corner";
  left: boolean;
} & Pick<
  React.ComponentProps<"button">,
  | "onPointerDownCapture"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onLostPointerCapture"
  | "onKeyDown"
>) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(
    () => registerOverlayPortal(button.current, { disableDrag: true }),
    [],
  );
  return (
    <button
      ref={button}
      type="button"
      className="editor-image-resize-handle"
      data-resize-handle={position}
      data-handle-side={left ? "left" : "right"}
      aria-label={
        position === "edge"
          ? "Resize image width"
          : "Resize image proportionally"
      }
      title="Drag to resize. Arrow keys: 10px; Shift + arrow: 1px; Escape: cancel."
      onClick={(event) => event.stopPropagation()}
      {...events}
    />
  );
}
