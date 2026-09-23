"use client";

import { useState } from "react";
import type { GoogleAuthSettings } from "@/core/auth/google_auth_schemas";
import { Notice } from "@/ui/primitives";

export function GoogleSetupGuide({
  settings,
}: {
  settings: GoogleAuthSettings;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(settings.callbackUrl);
      setCopyMessage("Callback URL copied.");
    } catch {
      setCopyMessage("Select and copy the callback URL from the field below.");
    }
  }
  return (
    <section
      className="panel form-stack google-setup-guide"
      aria-label="Google OAuth setup instructions"
    >
      <div>
        <h2>1. Create a Google OAuth client</h2>
        <p>
          In your club's Google Cloud project, configure the OAuth consent
          screen and create an OAuth client for a Web application.
        </p>
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Open Google Cloud credentials
        </a>
      </div>
      <div>
        <h2>2. Register this callback URL</h2>
        <p>
          Add the exact callback URL as an authorized redirect URI for that
          client. Use the values for this RotaPress installation.
        </p>
      </div>
      <label className="field">
        Website origin
        <input
          readOnly
          value={settings.origin}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <label className="field">
        Authorized redirect URI
        <input
          readOnly
          value={settings.callbackUrl}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <div>
        <button
          type="button"
          className="button button-outline"
          onClick={() => void copyCallback()}
        >
          Copy callback URL
        </button>
      </div>
      {copyMessage && <Notice kind="info">{copyMessage}</Notice>}
    </section>
  );
}
