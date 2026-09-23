"use client";

import { useState } from "react";

/** Browser actions use the server-supplied canonical URL, never the current URL. */
export function EventShareActions({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setMessage("Event link copied.");
    } catch {
      setMessage("The link could not be copied. Select and copy it below.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setMessage("");
    if (!navigator.share) {
      setMessage(
        "Sharing is unavailable in this browser. Copy the link below.",
      );
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage("Sharing could not open. Copy the link below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="event-share-actions">
      <div className="event-share-buttons">
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => void copy()}
        >
          Copy link
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => void share()}
        >
          Share event
        </button>
      </div>
      <label className="event-share-link">
        Event link
        <input
          type="url"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p className="event-share-status" role="status">
        {message}
      </p>
    </div>
  );
}
