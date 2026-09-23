"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AccountWorkspace } from "@/features/members/profile_schemas";
import { errorMessage, request } from "./api";
import { Notice } from "./primitives";
import { Icon } from "./icon";

export function MemberProfileEditor({
  initial,
  onSaved,
  onDirty,
}: {
  initial: AccountWorkspace;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [profile, setProfile] = useState(initial.profile);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved.profile);
  useEffect(() => {
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await request<AccountWorkspace>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: saved.version, profile }),
      });
      setSaved(next);
      setProfile(next.profile);
      setMessage("Profile saved.");
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="member-card member-profile-form" onSubmit={save}>
      <header className="member-card-heading">
        <div>
          <h2>Personal details</h2>
          <p>These details stay in your private account.</p>
        </div>
        <Icon name="members" />
      </header>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <fieldset disabled={busy} className="member-profile-fields">
        <label>
          Display name
          <input
            value={profile.displayName}
            maxLength={120}
            autoComplete="name"
            data-private
            onChange={(e) =>
              setProfile({ ...profile, displayName: e.target.value })
            }
          />
        </label>
        <label>
          Email address
          <input type="email" value={initial.email} readOnly data-private />
          <span className="field-help">Your verified sign-in address.</span>
        </label>
        <label>
          Phone number
          <input
            type="tel"
            value={profile.phone}
            maxLength={80}
            autoComplete="tel"
            data-private
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
        </label>
        <label>
          Preferred language
          <select
            value={profile.locale}
            onChange={(e) =>
              setProfile({
                ...profile,
                locale: e.target.value as typeof profile.locale,
              })
            }
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
          <span className="field-help">
            Available translations depend on the club.
          </span>
        </label>
        <label className="member-field-wide">
          About me
          <textarea
            value={profile.bio}
            rows={3}
            maxLength={1000}
            data-private
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>
        <label className="member-field-wide">
          Interests and skills
          <textarea
            value={profile.interests}
            rows={2}
            maxLength={500}
            data-private
            onChange={(e) =>
              setProfile({ ...profile, interests: e.target.value })
            }
          />
        </label>
      </fieldset>
      <footer className="member-save-bar">
        <span>
          {busy
            ? "Saving your changes…"
            : dirty
              ? "You have unsaved changes"
              : "Your profile is up to date"}
        </span>
        <button className="button button-accent" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </footer>
    </form>
  );
}
