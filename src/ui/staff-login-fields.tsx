"use client";

import type { StaffLogin } from "@/core/organization/club_profile";
import { GoogleSignInButton } from "./google-sign-in-button";

export function StaffLoginFields({
  value,
  onChange,
}: {
  value: StaffLogin;
  onChange: (value: StaffLogin) => void;
}) {
  return (
    <div className="form-stack">
      <h2>Google sign-in appearance</h2>
      <p className="field-help">
        Every Google-only sign-in page uses these settings and your published
        club logo. Account restrictions are managed in Integrations → Google
        sign-in.
      </p>
      <label>
        Sign-in label
        <input
          value={value.subtitle}
          maxLength={120}
          onChange={(event) =>
            onChange({ ...value, subtitle: event.target.value })
          }
        />
      </label>
      <label>
        Welcome heading
        <input
          value={value.title}
          required
          maxLength={120}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
        />
      </label>
      <label>
        Welcome message
        <textarea
          value={value.description}
          maxLength={500}
          rows={3}
          placeholder="Leave blank for the club’s default message."
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
        />
      </label>
      <div className="form-columns">
        <label>
          Google button color
          <select
            value={value.buttonTheme}
            onChange={(event) =>
              onChange({
                ...value,
                buttonTheme: event.target.value as StaffLogin["buttonTheme"],
              })
            }
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label>
          Google button shape
          <select
            value={value.buttonShape}
            onChange={(event) =>
              onChange({
                ...value,
                buttonShape: event.target.value as StaffLogin["buttonShape"],
              })
            }
          >
            <option value="rounded">Rounded</option>
            <option value="pill">Pill</option>
            <option value="square">Square</option>
          </select>
        </label>
      </div>
      <div className="staff-login-preview" aria-label="Google button preview">
        <GoogleSignInButton
          theme={value.buttonTheme}
          shape={value.buttonShape}
          onClick={() => {}}
        />
        <p className="field-help">
          Appearance preview. This button does not start sign-in.
        </p>
      </div>
    </div>
  );
}
