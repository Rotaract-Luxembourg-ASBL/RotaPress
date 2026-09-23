"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { request, errorMessage } from "@/ui/api";
import { Notice } from "@/ui/primitives";

export function EmailUnsubscribe() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const capability = useRef("");
  useEffect(() => {
    capability.current ||= window.location.hash.slice(1);
    queueMicrotask(() => setToken(capability.current));
    // Remove the capability from browser history after reading it; never store it.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function unsubscribe() {
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/email/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      style={{ maxWidth: "36rem", margin: "4rem auto", padding: "2rem" }}
    >
      <p className="eyebrow">Email preferences</p>
      <h1>{saved ? "Your preference is saved" : "Stop calendar emails?"}</h1>
      {saved ? (
        <p>
          Update and reminder emails for this calendar have stopped. You can
          review or restart notifications in My subscriptions.
        </p>
      ) : (
        <>
          <p>
            Stop update and reminder emails for the calendar linked to this
            message. Your website notifications, other calendars and sign-in
            emails stay available.
          </p>
          <p>You do not need to sign in.</p>
          {token ? (
            <button
              className="button button-accent"
              disabled={busy}
              onClick={() => void unsubscribe()}
            >
              {busy ? "Saving…" : "Unsubscribe from these emails"}
            </button>
          ) : (
            <p>
              Open the unsubscribe link in your calendar email, or manage your
              subscriptions below.
            </p>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
      <p>
        <Link href="/calendar?tab=subscriptions">My subscriptions</Link>
      </p>
    </section>
  );
}
