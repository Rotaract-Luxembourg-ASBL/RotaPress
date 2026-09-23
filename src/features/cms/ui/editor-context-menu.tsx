"use client";

import { createUsePuck } from "@puckeditor/core";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MediaPickerDialog } from "@/ui/media-picker";
import type { Block } from "../cms_schemas";
import type { puckConfig } from "./puck-config";

const useContextPuck = createUsePuck<typeof puckConfig>();
const zone = "root:default-zone";
type Position = { id: string; left: number; top: number };

/** Block actions use Puck's public dispatch, sharing toolbar undo and validation. */
export function EditorContextMenu({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (index: number) => void;
}) {
  const dispatch = useContextPuck((state) => state.dispatch);
  const blocks = useContextPuck((state) => state.appState.data.content);
  const selectedId = useContextPuck((state) => state.selectedItem?.props.id);
  const [position, setPosition] = useState<Position | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const index = blocks.findIndex((block) => block.props.id === position?.id);
  const block = blocks[index];
  const replacement = blocks.find((item) => item.props.id === replaceId);

  useEffect(() => {
    if (disabled) return;
    function open(id: string, x: number, y: number, element: HTMLElement) {
      const index = blocks.findIndex((item) => item.props.id === id);
      if (index < 0) return;
      returnFocus.current = element;
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index, zone } },
        recordHistory: false,
      });
      setPosition({
        id,
        left: Math.max(8, Math.min(x, window.innerWidth - 256)),
        top: Math.max(8, Math.min(y, window.innerHeight - 520)),
      });
    }
    function context(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(".editor-canvas")) return;
      // Preserve spelling, text selection and native input menus.
      if (
        event.target.closest(
          "input,textarea,[contenteditable='true'],[contenteditable='plaintext-only']",
        )
      )
        return;
      const direct = event.target.closest<HTMLElement>("[data-puck-component]");
      const element =
        direct ??
        Array.from(
          document.querySelectorAll<HTMLElement>(
            ".editor-canvas [data-puck-component]",
          ),
        ).find((item) => {
          const rect = item.getBoundingClientRect();
          return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          );
        });
      const id = element?.getAttribute("data-puck-component");
      if (!element || !id || !blocks.some((item) => item.props.id === id))
        return;
      event.preventDefault();
      event.stopPropagation();
      open(id, event.clientX, event.clientY, element);
    }
    function keyboard(event: globalThis.KeyboardEvent) {
      if (!(
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ))
        return;
      if (
        !selectedId ||
        !(event.target instanceof Element) ||
        !event.target.closest(".cms-puck")
      )
        return;
      if (
        event.target.closest(
          "input,textarea,[contenteditable='true'],[contenteditable='plaintext-only']",
        )
      )
        return;
      const element = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".editor-canvas [data-puck-component]",
        ),
      ).find((item) => item.getAttribute("data-puck-component") === selectedId);
      if (!element || !blocks.some((item) => item.props.id === selectedId))
        return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      open(selectedId, rect.left + 24, rect.top + 24, element);
    }
    document.addEventListener("contextmenu", context, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("contextmenu", context, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, [blocks, dispatch, disabled, selectedId]);

  useEffect(() => {
    if (!position || disabled) return;
    menu.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        setPosition(null);
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
    };
  }, [position, disabled]);

  function dismiss(focus = true) {
    setPosition(null);
    if (focus) returnFocus.current?.focus();
  }
  function act(operation: () => void) {
    if (disabled || !block) return;
    operation();
    dismiss();
  }
  function imageChange(
    props: Partial<Extract<Block, { type: "Image" }>["props"]>,
  ) {
    if (block?.type !== "Image") return;
    act(() =>
      dispatch({
        type: "replace",
        destinationIndex: index,
        destinationZone: zone,
        data: { ...block, props: { ...block.props, ...props } },
      }),
    );
  }
  function move(offset: number) {
    act(() => {
      dispatch({
        type: "reorder",
        sourceIndex: index,
        destinationIndex: index + offset,
        destinationZone: zone,
      });
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: index + offset, zone } },
        recordHistory: false,
      });
    });
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      dismiss();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    }
  }
  return (
    <>
      {position &&
        block &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            className="editor-context-menu"
            role="menu"
            aria-label="Block actions"
            style={{ left: position.left, top: position.top }}
            onKeyDown={keys}
          >
            <p>
              {block.type === "Image" ? "Image tools" : `${block.type} block`}
            </p>
            {block.type === "Image" && (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setReplaceId(block.props.id);
                    dismiss(false);
                  }}
                >
                  Replace image…
                </button>
                <div
                  className="editor-context-row"
                  role="group"
                  aria-label="Image alignment"
                >
                  {(["left", "center", "right"] as const).map((alignment) => (
                    <button
                      role="menuitemradio"
                      aria-checked={
                        (block.props.alignment ?? "center") === alignment
                      }
                      key={alignment}
                      onClick={() => imageChange({ alignment })}
                    >
                      Align {alignment}
                    </button>
                  ))}
                </div>
                <button
                  role="menuitem"
                  onClick={() =>
                    imageChange({ flipHorizontal: !block.props.flipHorizontal })
                  }
                >
                  Flip horizontally
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    imageChange({ flipVertical: !block.props.flipVertical })
                  }
                >
                  Flip vertically
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    imageChange({
                      widthPx: 0,
                      width: "full",
                      aspectRatio: "original",
                      fit: "cover",
                      focalX: 50,
                      focalY: 50,
                      flipHorizontal: false,
                      flipVertical: false,
                      corners: "soft",
                    })
                  }
                >
                  Reset image appearance
                </button>
                <hr />
              </>
            )}
            <button role="menuitem" onClick={() => act(() => onInsert(index))}>
              Insert block before
            </button>
            <button
              role="menuitem"
              onClick={() => act(() => onInsert(index + 1))}
            >
              Insert block after
            </button>
            <hr />
            <button
              role="menuitem"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              Move up
            </button>
            <button
              role="menuitem"
              disabled={index === blocks.length - 1}
              onClick={() => move(1)}
            >
              Move down
            </button>
            <button
              role="menuitem"
              onClick={() =>
                act(() =>
                  dispatch({
                    type: "duplicate",
                    sourceIndex: index,
                    sourceZone: zone,
                  }),
                )
              }
            >
              Duplicate block
            </button>
            <button
              role="menuitem"
              className="editor-context-danger"
              onClick={() =>
                act(() => dispatch({ type: "remove", index, zone }))
              }
            >
              Remove block
            </button>
          </div>,
          document.body,
        )}
      {replacement?.type === "Image" &&
        !disabled &&
        createPortal(
          <MediaPickerDialog
            currentId={replacement.props.assetId}
            onDismiss={() => {
              setReplaceId(null);
              returnFocus.current?.focus();
            }}
            onRemoved={(id) => {
              if (id !== replacement.props.assetId) return;
              const destinationIndex = blocks.findIndex(
                (item) => item.props.id === replacement.props.id,
              );
              if (destinationIndex >= 0)
                dispatch({
                  type: "replace",
                  destinationIndex,
                  destinationZone: zone,
                  data: {
                    ...replacement,
                    props: { ...replacement.props, assetId: "" },
                  },
                });
              setReplaceId(null);
            }}
            onInsert={(asset) => {
              const destinationIndex = blocks.findIndex(
                (item) => item.props.id === replacement.props.id,
              );
              if (destinationIndex >= 0)
                dispatch({
                  type: "replace",
                  destinationIndex,
                  destinationZone: zone,
                  data: {
                    ...replacement,
                    props: {
                      ...replacement.props,
                      assetId: asset.id,
                      alt: asset.alt,
                    },
                  },
                });
              setReplaceId(null);
              returnFocus.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}
