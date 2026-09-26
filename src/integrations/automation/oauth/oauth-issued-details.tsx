"use client";
import { useState } from "react";
import { oauthClientPresets, type OAuthPlatform } from "./client-presets";

export type IssuedOAuthClient = {
  clientId: string;
  clientSecret?: string;
  resource: string;
};

export function OAuthIssuedDetails({
  issued,
  platform,
  onDone,
}: {
  issued: IssuedOAuthClient;
  platform: OAuthPlatform;
  onDone: () => void;
}) {
  const [message, setMessage] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const fields = [
    {
      label: "MCP server URL",
      value: issued.resource,
      copy: "Copy MCP server URL",
    },
    {
      label: "OAuth client ID",
      value: issued.clientId,
      copy: "Copy client ID",
    },
    ...(issued.clientSecret
      ? [
          {
            label: "OAuth client secret",
            value: issued.clientSecret,
            copy: "Copy client secret",
            secret: true,
          },
        ]
      : []),
  ];
  return (
    <div
      className="credential-issued oauth-issued"
      aria-labelledby="oauth-issued-title"
    >
      <h3 id="oauth-issued-title">
        Finish connecting{" "}
        {platform === "custom"
          ? "your AI app"
          : platform === "claude"
            ? "Claude"
            : "ChatGPT"}
      </h3>
      <p>{oauthClientPresets[platform].instructions}</p>
      {!issued.clientSecret && (
        <p>This public client uses PKCE. Leave the client secret empty.</p>
      )}
      {fields.map((field) => (
        <div className="oauth-copy-field" key={field.label}>
          <label>
            {field.label}
            <input
              type={"secret" in field && !showSecret ? "password" : "text"}
              autoComplete="off"
              readOnly
              value={field.value}
            />
          </label>
          <button
            type="button"
            className="button button-outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(field.value);
                setMessage(`${field.label} copied.`);
              } catch {
                setMessage(
                  "secret" in field
                    ? "Copying is unavailable. Use Show client secret, then select and copy the field manually."
                    : `Copying is unavailable. Select the ${field.label.toLowerCase()} field and copy it manually.`,
                );
              }
            }}
          >
            {field.copy}
          </button>
          {"secret" in field && (
            <button
              type="button"
              className="inline-button"
              aria-pressed={showSecret}
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? "Hide client secret" : "Show client secret"}
            </button>
          )}
        </div>
      ))}
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
      {issued.clientSecret && (
        <p className="small muted">
          The client secret is shown once. Paste it only into your app's
          protected connection settings.
        </p>
      )}
      <p>
        Finish in your AI app, then sign in to RotaPress and approve access.
        Creating these details does not connect the app yet.
      </p>
      <button type="button" className="button button-outline" onClick={onDone}>
        I saved the OAuth details
      </button>
    </div>
  );
}
