"use client";
import { useRef, useState } from "react";
import { errorMessage, request } from "@/ui/api";

/** Retain an identical request ID on a transport retry; changed decisions get a new ID. */
export function useDrawMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const replay = useRef({ signature: "", id: "" });
  async function submit(
    endpoint: string,
    payload: object,
    withRequestId = true,
  ) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    const signature = JSON.stringify({ endpoint, payload });
    if (replay.current.signature !== signature)
      replay.current = { signature, id: crypto.randomUUID() };
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          mode: "demo",
          ...(withRequestId ? { requestId: replay.current.id } : {}),
        }),
      });
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, submit };
}
