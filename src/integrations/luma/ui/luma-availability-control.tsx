"use client";
import { useState } from "react";
import { request, errorMessage } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import { Dialog } from "@/ui/dialog";
import type { LumaAvailabilityDto } from "../luma_schemas";

/** Shared by the catalogue card and Luma settings; the server owns activation. */
export function LumaAvailabilityControl({
  data,
  onSaved,
}: {
  data: LumaAvailabilityDto;
  onSaved: () => void;
}) {
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  return (
    <>
      <button
        className={`button ${data.enabled ? "button-outline" : "button-accent"}`}
        onClick={() => {
          setReview(true);
          setConfirmed(false);
          setProblem(undefined);
        }}
      >
        {data.enabled ? "Disable Luma" : "Enable Luma"}
      </button>
      {review && (
        <Dialog
          title="Review Luma availability"
          onClose={() => setReview(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              {data.enabled
                ? "Disable Luma registration links on this website and stop API checks, guest imports and webhook reception. Saved credentials, link drafts, published destinations and imported history are retained."
                : "Enable Luma for the club. Existing published links resume where the event and Registration feature are active. Previously enabled webhook reception resumes. Managers can publish new links and use a separately checked API connection."}
            </p>
            <p>
              This does not enable event features, contact Luma or cancel
              provider bookings.
            </p>
            {problem && (
              <Notice>
                {problem}{" "}
                <button
                  className="inline-button"
                  disabled={busy}
                  onClick={() => {
                    setReview(false);
                    onSaved();
                  }}
                >
                  Reload settings
                </button>
              </Notice>
            )}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
              />
              I confirm this availability change for the club.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setProblem(undefined);
                try {
                  await request("/api/admin/integrations/luma", {
                    method: "POST",
                    body: JSON.stringify({
                      expectedVersion: data.version,
                      enabled: !data.enabled,
                      confirmed: true,
                    }),
                  });
                  setReview(false);
                  onSaved();
                  window.dispatchEvent(new Event("luma-availability-updated"));
                } catch (cause) {
                  setProblem(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Confirm Luma availability"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
