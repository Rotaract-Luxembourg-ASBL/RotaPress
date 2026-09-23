"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { type CurrentUser, errorMessage, request, useResource } from "./api";
import { ClubFields, initialClubSettings } from "./club-fields";
import { Arrow, Brand, Loading, Notice, PageHeading } from "./primitives";

export function SetupForm() {
  const router = useRouter();
  const { data: me, error: loadError } = useResource<CurrentUser>("/api/me");
  const [settings, setSettings] = useState(initialClubSettings);
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/setup", {
        method: "POST",
        body: JSON.stringify({ ...settings, claim }),
      });
      setClaim("");
      router.replace("/admin");
      router.refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-site">
      <header className="public-header content-width">
        <Brand />
        <Link href="/" className="text-link">
          Back to website <Arrow diagonal />
        </Link>
      </header>
      <main id="main-content" className="content-width setup-page">
        <PageHeading
          eyebrow="Welcome to RotaPress"
          title="Make it your club."
          description="A shared home starts with an identity. Set yours up here."
        />
        {loadError ? (
          <Notice>{loadError}</Notice>
        ) : !me ? (
          <Loading />
        ) : me.installed ? (
          <section className="panel empty-state">
            <h2>Your club is already set up.</h2>
            <p>
              Initial ownership has been claimed. Club settings are managed in
              administration.
            </p>
            <Link href="/admin" className="button button-accent">
              Open administration <Arrow />
            </Link>
          </section>
        ) : !me.actor ? (
          <section className="panel empty-state">
            <h2>First, verify your identity.</h2>
            <p>
              Sign in with the owner email nominated during local setup. You
              will also need the expiring installation claim.
            </p>
            <Link href="/sign-in?next=/setup" className="button button-accent">
              Verify owner email <Arrow />
            </Link>
          </section>
        ) : (
          <div className="settings-grid">
            <section className="panel">
              <h2>Club identity</h2>
              <p className="muted section-description">
                These details introduce your club on its public homepage.
              </p>
              {error && <Notice>{error}</Notice>}
              <form className="form-stack" onSubmit={submit}>
                <ClubFields value={settings} onChange={setSettings} />
                <div className="form-divider" />
                <label>
                  Installation claim
                  <input
                    name="claim"
                    type="password"
                    autoComplete="off"
                    value={claim}
                    onChange={(event) => setClaim(event.target.value)}
                    maxLength={256}
                    required
                    aria-describedby="claim-help"
                  />
                </label>
                <p id="claim-help" className="field-help">
                  Use the short-lived claim created by the local setup command.
                  It can be used once, by the nominated owner.
                </p>
                <button
                  type="submit"
                  className="button button-accent"
                  disabled={busy}
                >
                  {busy
                    ? "Creating your club…"
                    : "Create club and claim ownership"}
                  <Arrow />
                </button>
              </form>
            </section>
            <aside className="setup-aside">
              <span className="large-asterisk" aria-hidden="true">
                ✳
              </span>
              <p className="eyebrow">A secure beginning</p>
              <h2>
                Yours from
                <br />
                the first day.
              </h2>
              <p>
                You are signed in as <strong>{me.actor.email}</strong>.
              </p>
              <p>
                The setup claim and your verified email establish the first
                owner together. Signing in on its own never grants ownership.
              </p>
              <p className="small muted">
                You can change your club’s identity and invite members after
                setup.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
