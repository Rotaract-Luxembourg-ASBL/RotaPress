"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DomainSettings } from "./domain-settings";
import { useEffect, useState, type FormEvent } from "react";
import { type AdminSettings, errorMessage, request, useResource } from "./api";
import { useCurrentUser } from "./admin-shell";
import { ClubFields } from "./club-fields";
import { StaffLoginFields } from "./staff-login-fields";
import { Loading, Notice, PageHeading } from "./primitives";

function SettingsForm({
  initial,
  panel,
  onDirty,
  onSaved,
}: {
  initial: AdminSettings;
  panel: string;
  onDirty: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const me = useCurrentUser();
  const [settings, setSettings] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline);
  useEffect(() => onDirty(dirty || busy), [dirty, busy, onDirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      await request("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setBaseline(settings);
      setSaved(true);
      onSaved();
      window.dispatchEvent(new Event("club-settings-updated"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel form-stack settings-form"
      onSubmit={submit}
      aria-busy={busy}
    >
      {error && <Notice>{error} Your entered settings are preserved.</Notice>}
      {saved && (
        <Notice kind="success">
          Club settings saved. Identity updated; published page content is
          unchanged.
        </Notice>
      )}
      <fieldset className="form-stack" disabled={busy}>
        {panel === "general" && (
          <ClubFields
            grouped
            showBranding={false}
            value={settings}
            onChange={(value) => {
              setSettings({ ...settings, ...value });
              setSaved(false);
            }}
          />
        )}
        {panel === "security" && (
          <>
            <h2>Staff sign-in policy</h2>
            <label>
              Allowed staff sign-in
              <select
                name="staffAuthPolicy"
                value={settings.staffAuthPolicy}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    staffAuthPolicy: e.target
                      .value as AdminSettings["staffAuthPolicy"],
                  });
                  setSaved(false);
                }}
              >
                <option value="email-or-google">
                  Email verification or Google
                </option>
                <option value="google" disabled={!me.googleConfigured}>
                  Google only
                </option>
              </select>
            </label>
            <p className="field-help">
              {me.googleConfigured
                ? "Google-only access requires a current Google sign-in. A linked account alone does not grant staff access."
                : "Google is not configured. Email verification is available; Google-only staff access cannot be enabled yet."}{" "}
              <Link href="/admin/integrations/google">
                Configure Google sign-in
              </Link>
            </p>
            <StaffLoginFields
              value={settings.staffLogin}
              onChange={(staffLogin) => {
                setSettings({ ...settings, staffLogin });
                setSaved(false);
              }}
            />
          </>
        )}
      </fieldset>
      <div className="form-actions settings-save">
        <button
          type="submit"
          className="button button-accent"
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <span className="small muted" role="status">
          {busy
            ? "Saving settings…"
            : dirty
              ? "Unsaved changes"
              : saved
                ? "All changes saved"
                : "No changes"}
        </span>
      </div>
    </form>
  );
}

export function SettingsPanel() {
  const params = useSearchParams();
  const [panel, setPanel] = useState(
    ["general", "website", "security", "domains", "communications"].includes(
      params.get("tab") ?? "",
    )
      ? params.get("tab")!
      : "general",
  );
  const [dirty, setDirty] = useState(false);
  const me = useCurrentUser();
  const tabs = [
    ["general", "Club & region"],
    ["website", "Website & SEO"],
    ["security", "Sign-in & security"],
    ["domains", "Domains"],
    ["communications", "Forms & notifications"],
  ];
  function navigate(value: string) {
    if (dirty && !window.confirm("Leave without saving your settings?")) return;
    setDirty(false);
    setPanel(value);
  }
  const {
    data: settings,
    error,
    refresh,
  } = useResource<AdminSettings>("/api/admin/settings");
  return (
    <>
      <PageHeading
        title="Club settings"
        description="Manage club identity, regional defaults and staff sign-in."
      />
      <div className="settings-workspace">
        <nav
          className="admin-section-nav settings-navigation"
          aria-label="Settings sections"
        >
          {tabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-current={panel === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="form-stack">
          {panel === "website" && (
            <section className="panel form-stack">
              <h2>Website controls, in one place</h2>
              <p>
                Website settings have their own preview and publication
                workflow.
              </p>
              <Link
                className="settings-destination"
                href="/admin/website?tab=appearance"
              >
                <strong>Branding & appearance</strong>
                <span>Logo, browser icon, colors, typography and layout</span>
              </Link>
              <Link
                className="settings-destination"
                href="/admin/website?tab=seo"
              >
                <strong>Search & sharing</strong>
                <span>
                  Default metadata, social image, indexing and Search Console
                </span>
              </Link>
              <Link
                className="settings-destination"
                href="/admin/website?tab=pages"
              >
                <strong>Page settings</strong>
                <span>
                  Each page's name, URL, description and sharing image
                </span>
              </Link>
            </section>
          )}
          {panel === "domains" && <DomainSettings />}
          {panel === "communications" && (
            <section className="panel form-stack">
              <h2>Forms & notifications</h2>
              <p>
                Questions, rules and notifications belong to each form.
                Responses come together in the response center.
              </p>
              <Link className="settings-destination" href="/admin/forms">
                <strong>Form configuration</strong>
                <span>
                  Templates, conditional questions, retention, email recipients
                  and signed webhooks
                </span>
              </Link>
              <Link className="settings-destination" href="/admin/inbox">
                <strong>Response center</strong>
                <span>
                  All forms, filters, contact history and delivery status
                </span>
              </Link>
              <Link className="settings-destination" href="/admin/integrations">
                <strong>Integrations</strong>
                <span>Manage available features and external connections</span>
              </Link>
            </section>
          )}
          {panel === "security" && (
            <section className="panel form-stack">
              <h2>Browser & account protection</h2>
              <dl className="settings-facts">
                <div>
                  <dt>CORS</dt>
                  <dd>Same origin only. Cross-site API access is blocked.</dd>
                </div>
                <div>
                  <dt>Private actions</dt>
                  <dd>
                    Current session, membership and resource permissions checked
                    on the server.
                  </dd>
                </div>
                <div>
                  <dt>Recent sign-in</dt>
                  <dd>
                    Required for credentials and permission changes. Routine
                    identity, profile and website edits use your current
                    session.
                  </dd>
                </div>
                <div>
                  <dt>Google sign-in</dt>
                  <dd>{me.googleConfigured ? "Enabled" : "Not enabled"}</dd>
                </div>
              </dl>
              <Link href="/admin/integrations/google">
                Configure Google sign-in
              </Link>
              <Link href="/sign-in?next=/admin/settings&reauth=1">
                Confirm identity for a security change
              </Link>
            </section>
          )}
          {(panel === "general" || panel === "security") && (
            <>
              {error ? (
                <Notice>
                  {error}{" "}
                  <button className="inline-button" onClick={refresh}>
                    Try again
                  </button>
                </Notice>
              ) : settings ? (
                <SettingsForm
                  key={panel}
                  initial={settings}
                  panel={panel}
                  onDirty={setDirty}
                  onSaved={refresh}
                />
              ) : (
                <Loading />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
