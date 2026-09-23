"use client";

import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";

export type GoogleReview = "save" | "enable" | "disable" | "disconnect";
export const googleActionLabels: Record<GoogleReview, string> = {
  save: "Save credentials disabled",
  enable: "Enable Google sign-in",
  disable: "Disable Google sign-in",
  disconnect: "Remove Google credentials",
};

export function GoogleSettingsReview({
  action,
  busy,
  error,
  onClose,
  onConfirm,
  onReload,
}: {
  action: GoogleReview;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
  onReload: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Dialog
      title={googleActionLabels[action]}
      onClose={onClose}
      canClose={() => !busy}
    >
      <div className="form-stack">
        <p>
          {action === "save"
            ? "Save these credentials securely and keep Google sign-in disabled. This replaces the current configuration and resets its verification. Enable and verify the saved connection in the following steps."
            : action === "enable"
              ? "Make the saved Google connection available on sign-in pages. This does not verify the credentials; complete a Google sign-in after enabling."
              : action === "disable"
                ? "Stop new Google sign-ins. The saved credentials remain available to enable again later."
                : "Remove the saved Google credentials and disable Google sign-in. RotaPress will not fall back to credentials in the installation environment. This does not delete the client in Google Cloud."}
        </p>
        <p>
          Previous Google sessions will be signed out. People using Google,
          including you if applicable, must sign in again.
        </p>
        {error && (
          <Notice>
            {error}{" "}
            <button
              type="button"
              className="inline-button"
              disabled={busy}
              onClick={onReload}
            >
              Reload saved settings
            </button>
          </Notice>
        )}
        <label className="forms-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I understand the change and its effect on Google sessions.
          </span>
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onClose}
          >
            Keep current settings
          </button>
          <button
            type="button"
            className="button button-accent"
            disabled={busy || !confirmed}
            onClick={onConfirm}
          >
            {busy ? "Saving…" : googleActionLabels[action]}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
