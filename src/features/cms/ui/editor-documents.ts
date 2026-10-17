/** Puck's same-origin viewport owns keyboard/pointer events when its canvas has focus. */
export function observeEditorDocuments(
  bind: (document: Document) => () => void,
) {
  const cleanups = new Map<Document, () => void>();
  const frames = new Map<HTMLIFrameElement, () => void>();
  const scan = () => {
    const active = new Set<Document>([document]);
    const currentFrames = new Set(
      document.querySelectorAll<HTMLIFrameElement>(".editor-canvas iframe"),
    );
    for (const frame of currentFrames) {
      // Only the editor viewport; embedded custom content keeps its own boundary.
      try {
        if (frame.contentDocument) active.add(frame.contentDocument);
      } catch {
        /* Cross-origin widgets are not editor surfaces. */
      }
      if (!frames.has(frame)) {
        frame.addEventListener("load", scan);
        frames.set(frame, () => frame.removeEventListener("load", scan));
      }
    }
    for (const [frame, cleanup] of frames)
      if (!currentFrames.has(frame)) {
        cleanup();
        frames.delete(frame);
      }
    for (const [entry, cleanup] of cleanups)
      if (!active.has(entry)) {
        cleanup();
        cleanups.delete(entry);
      }
    for (const entry of active)
      if (!cleanups.has(entry)) cleanups.set(entry, bind(entry));
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    frames.forEach((cleanup) => cleanup());
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function editorEventTarget(event: Event): Element | null {
  const target = event.target as Element | null;
  return target && typeof target.closest === "function" ? target : null;
}

export function editorViewportPoint(owner: Document, x: number, y: number) {
  const frame = owner.defaultView?.frameElement;
  if (!frame || !frame.closest(".editor-canvas")) return { x, y };
  const bounds = frame.getBoundingClientRect();
  const scaleX = bounds.width / (frame.clientWidth || bounds.width);
  const scaleY = bounds.height / (frame.clientHeight || bounds.height);
  return { x: bounds.left + x * scaleX, y: bounds.top + y * scaleY };
}
