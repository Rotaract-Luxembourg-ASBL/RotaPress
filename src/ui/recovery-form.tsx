"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { type CurrentUser, errorMessage, request, useResource } from "./api";
import { Arrow, Loading, Notice, PageHeading } from "./primitives";

export function RecoveryForm() {
  const router = useRouter();
  const { data: me, error: loadError } = useResource<CurrentUser>("/api/me");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await request("/api/recovery", {
        method: "POST",
        body: JSON.stringify({ claim }),
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
    <main id="main-content" className="content-width setup-page">
      <PageHeading
        eyebrow="Local owner recovery"
        title="Return to your club."
        description="Restore access using a protected recovery claim and your verified owner identity."
      />
      {loadError ? (
        <Notice>{loadError}</Notice>
      ) : !me ? (
        <Loading />
      ) : !me.actor ? (
        <section className="panel empty-state">
          <h2>Verify the nominated owner email.</h2>
          <p>
            Sign in using the existing owner account nominated by the privileged
            local recovery command.
          </p>
          <Link href="/sign-in?next=/recovery" className="button button-accent">
            Verify owner email <Arrow />
          </Link>
        </section>
      ) : (
        <div className="settings-grid">
          <section className="panel">
            <h2>Owner recovery</h2>
            <p className="muted section-description">
              You are signed in as {me.actor.email}.
            </p>
            {error && <Notice>{error}</Notice>}
            <form className="form-stack" onSubmit={submit}>
              <label>
                Recovery claim
                <input
                  name="claim"
                  type="password"
                  autoComplete="off"
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  maxLength={256}
                  required
                  aria-describedby="recovery-help"
                />
              </label>
              <p id="recovery-help" className="field-help">
                Use the short-lived, single-use claim created by the local
                recovery command. Your verified identity must match the
                nominated existing owner.
              </p>
              <button
                type="submit"
                className="button button-accent"
                disabled={busy}
              >
                {busy ? "Restoring access…" : "Recover owner access"}
                <Arrow />
              </button>
            </form>
          </section>
          <aside className="settings-aside">
            <p className="eyebrow">Protected recovery</p>
            <h2>
              A deliberate
              <br />
              way back.
            </h2>
            <p>
              The recovery claim is issued separately by an operator with access
              to this installation’s local command line. This page cannot issue
              a claim or choose a new owner.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
