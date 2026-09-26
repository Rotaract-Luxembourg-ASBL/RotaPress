"use client";
import { useId } from "react";
import {
  defaultOAuthSetup,
  oauthClientPresets,
  type OAuthPlatform,
  type OAuthSetup,
} from "./client-presets";

export function OAuthSetupFields({
  platform,
  onPlatformChange,
  value,
  onChange,
  disabled,
}: {
  platform: OAuthPlatform;
  onPlatformChange: (platform: OAuthPlatform) => void;
  value: OAuthSetup;
  onChange: (value: OAuthSetup) => void;
  disabled: boolean;
}) {
  const helpId = useId();
  const preset = oauthClientPresets[platform];
  const custom = platform === "custom";
  const overridden =
    !custom &&
    (value.redirects !== preset.redirects ||
      value.authentication !== "client_secret_post");
  return (
    <>
      <div className="oauth-setup-fields">
        <label>
          AI app
          <select
            value={platform}
            onChange={(event) =>
              onPlatformChange(event.target.value as OAuthPlatform)
            }
            disabled={disabled}
            aria-describedby={helpId}
          >
            {Object.entries(oauthClientPresets).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          OAuth connection name
          <input
            required
            minLength={2}
            maxLength={80}
            value={value.name}
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
            disabled={disabled}
          />
        </label>
      </div>
      <p id={helpId} className="oauth-setup-hint" role="status">
        {custom
          ? "Use Advanced below to enter your app's exact callback. Settings vary between apps and accounts."
          : overridden
            ? "Using your custom connection settings. You can restore the app's defaults in Advanced."
            : `${preset.label} settings are filled in automatically. Choose what it can do below.`}
      </p>
      <details
        key={platform}
        className="oauth-advanced"
        open={custom || undefined}
      >
        <summary>
          Advanced connection settings{overridden ? " · customized" : ""}
        </summary>
        <div className="oauth-advanced-fields">
          <label>
            OAuth callback URLs
            <textarea
              required
              rows={2}
              value={value.redirects}
              onChange={(event) =>
                onChange({ ...value, redirects: event.target.value })
              }
              onInvalid={(event) => {
                // A required field must remain focusable even after Advanced is collapsed.
                const details = event.currentTarget.closest("details");
                if (details) details.open = true;
              }}
              disabled={disabled}
              aria-describedby={`${helpId}-callback`}
              placeholder="Paste the exact callback URL shown by your AI app"
            />
          </label>
          <p id={`${helpId}-callback`} className="small muted">
            Where your app receives the sign-in result. Use one exact HTTPS URL
            per line, up to three. If your app shows an account-specific
            callback, use that value. Local RotaPress installations also accept
            loopback HTTP callbacks for testing.
            {preset.reference && (
              <>
                {" "}
                <a href={preset.reference} target="_blank" rel="noreferrer">
                  Callback reference
                </a>
                .
              </>
            )}
          </p>
          <label>
            OAuth client authentication
            <select
              value={value.authentication}
              onChange={(event) =>
                onChange({
                  ...value,
                  authentication: event.target
                    .value as OAuthSetup["authentication"],
                })
              }
              disabled={disabled}
            >
              <option value="client_secret_post">Client ID and secret</option>
              <option value="none">Public client with PKCE</option>
            </select>
          </label>
          <p className="small muted">
            Keep Client ID and secret unless your app specifically asks for a
            public client with PKCE.
          </p>
          {!custom && (
            <button
              type="button"
              className="inline-button"
              disabled={disabled || !overridden}
              onClick={() =>
                onChange({ ...defaultOAuthSetup(platform), name: value.name })
              }
            >
              Restore app defaults
            </button>
          )}
        </div>
      </details>
    </>
  );
}
