"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type CurrentUser, errorMessage, request, useResource } from "./api";
import { ClubFields, initialClubSettings } from "./club-fields";
import { Arrow, Loading, Notice } from "./primitives";
import { Icon } from "./icon";
import { SetupFrame, SetupHelp, SetupEmailRequired } from "./setup-frame";
import { SignOutButton } from "./sign-out-button";
import { SetupWebsiteChoice } from "./setup-website-choice";
import type { KitId } from "@/features/cms/kits/catalogue";

export function SetupForm() {
  const router = useRouter();
  const {
    data: me,
    error: loadError,
    refresh,
  } = useResource<CurrentUser>("/api/me");
  const [settings, setSettings] = useState({
    ...initialClubSettings,
    accentColor: "#17458f",
  });
  const [claim, setClaim] = useState("");
  const [stage, setStage] = useState<"identity" | "website" | "review">(
    "identity",
  );
  const [templateId, setTemplateId] = useState<KitId | null>("rotary-service");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [openingLink, setOpeningLink] = useState(true);
  const linkProcessed = useRef(false);

  useEffect(() => {
    if (linkProcessed.current) return;
    linkProcessed.current = true;
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get(
      "setup",
    );
    if (!incoming) {
      queueMicrotask(() => setOpeningLink(false));
      return;
    }
    // The private claim never enters a query string, access log or browser storage.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    void request("/api/setup/claim", {
      method: "POST",
      body: JSON.stringify({ claim: incoming }),
    })
      .then(refresh)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setOpeningLink(false));
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== "review") {
      setStage(stage === "identity" ? "website" : "review");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/setup", {
        method: "POST",
        body: JSON.stringify({ ...settings, claim, templateId }),
      });
      setClaim("");
      router.replace(templateId ? "/admin/website?tab=templates" : "/admin");
      router.refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SetupFrame
      step={me?.installed ? 3 : !me?.setupEmailReady ? 0 : me?.actor ? 2 : 1}
    >
      {error && !me?.actor && <Notice>{error}</Notice>}
      {loadError ? (
        <section className="setup-card">
          <h1>Let’s get you started.</h1>
          <Notice>{loadError}</Notice>
          <button className="button button-accent" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : !me || openingLink ? (
        <section className="setup-card">
          <h1>Getting your setup ready.</h1>
          <Loading />
        </section>
      ) : me.installed ? (
        <section className="setup-card">
          <span className="setup-card-icon">
            <Icon name="check" width={26} height={26} />
          </span>
          <p className="setup-eyebrow">Ready for what’s next</p>
          <h1>Your club is already set up.</h1>
          <p className="setup-description">
            Your workspace is ready. Open administration to manage your club,
            choose a website template and start creating.
          </p>
          <Link href="/admin" className="button button-accent">
            Open administration <Arrow />
          </Link>
        </section>
      ) : !me.setupEmailReady ? (
        <SetupEmailRequired />
      ) : !me.actor ? (
        <section className="setup-card">
          <span className="setup-card-icon">
            <Icon name="mail" width={26} height={26} />
          </span>
          <p className="setup-eyebrow">Step 02 · Owner access</p>
          <h1>Start with you.</h1>
          <p className="setup-description">
            Welcome to RotaPress. First, verify the email you nominated as this
            club’s owner. Then we’ll make this space yours.
          </p>
          <Link
            href="/sign-in?next=/setup"
            className="button button-accent button-full"
          >
            Verify owner email <Arrow />
          </Link>
          <div className="setup-checklist">
            <h2>
              {me.setupClaimReady
                ? "Your setup link is ready"
                : "Two things to have ready"}
            </h2>
            <div>
              <Icon name="mail" />
              <p>
                <strong>Your nominated email</strong>
                <span>
                  We’ll send a code to verify it. No password to create.
                </span>
              </p>
            </div>
            <div>
              <Icon name="check" />
              <p>
                <strong>
                  {me.setupClaimReady
                    ? "Secure setup link received"
                    : "Your installation claim"}
                </strong>
                <span>
                  {me.setupClaimReady
                    ? "Just verify your email to continue. There is no setup key to copy."
                    : "The private, one-use key created when you ran setup."}
                </span>
              </p>
            </div>
          </div>
          <SetupHelp />
        </section>
      ) : (
        <section className="setup-card setup-details">
          <p className="setup-eyebrow">Step 03 · Club details</p>
          <h1>Make it your club.</h1>
          <p className="setup-description">
            Introduce your community. You can update these details later in
            Settings.
          </p>
          <div className="setup-account">
            <Icon name="check" />
            <p>
              Signed in as <strong>{me.actor.email}</strong>
            </p>
            <SignOutButton />
          </div>
          {error && <Notice>{error}</Notice>}
          <form onSubmit={submit} aria-busy={busy || undefined}>
            <p className="setup-eyebrow" role="status">
              {stage === "identity"
                ? "1 of 3 · Your club"
                : stage === "website"
                  ? "2 of 3 · Your website"
                  : "3 of 3 · Review and create"}
            </p>
            <fieldset className="setup-fields form-stack" disabled={busy}>
              <legend className="sr-only">Club details and ownership</legend>
              {stage === "identity" && (
                <ClubFields
                  value={settings}
                  onChange={(next) => {
                    setSettings(next);
                    if (next.profile.clubType !== settings.profile.clubType) {
                      if (next.profile.clubType === "rotaract") {
                        setTemplateId("rotaract-action");
                        setSettings({ ...next, accentColor: "#d41367" });
                      } else if (next.profile.clubType === "rotary") {
                        setTemplateId("rotary-service");
                        setSettings({ ...next, accentColor: "#17458f" });
                      }
                    }
                  }}
                  showBranding={false}
                />
              )}
              {stage === "website" && (
                <>
                  <SetupWebsiteChoice
                    value={templateId}
                    onChange={(next) => {
                      setTemplateId(next);
                      if (next)
                        setSettings({
                          ...settings,
                          accentColor:
                            next === "rotary-service" ? "#17458f" : "#d41367",
                        });
                    }}
                  />
                  <label>
                    Website accent color
                    <input
                      type="color"
                      value={settings.accentColor}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          accentColor: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
              {stage === "review" && (
                <>
                  <h2>{settings.name}</h2>
                  <p>
                    {[settings.profile.city, settings.profile.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p>
                    {templateId === "rotaract-action"
                      ? "Rotaract Action"
                      : templateId === "rotary-service"
                        ? "Rotary Service"
                        : "Blank website"}{" "}
                    · {settings.locale.toUpperCase()} · {settings.timezone}
                  </p>
                  <p>
                    Your website stays private until you review and publish it.
                    Next, connect Google sign-in in Integrations, then choose
                    your staff access policy in Settings.
                  </p>
                  {me.setupClaimReady ? (
                    <p className="field-help">
                      Your secure setup link is ready. Create your club to
                      finish.
                    </p>
                  ) : (
                    <div className="setup-claim">
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
                        Paste the private installation claim supplied by your
                        server administrator. It confirms that this installation
                        belongs to you.
                      </p>
                    </div>
                  )}
                </>
              )}
              {stage !== "identity" && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() =>
                    setStage(stage === "review" ? "website" : "identity")
                  }
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="button button-accent button-full"
                disabled={busy}
              >
                {busy
                  ? "Creating your club…"
                  : stage === "review"
                    ? "Create club and claim ownership"
                    : "Continue"}
                <Arrow />
              </button>
            </fieldset>
          </form>
          <SetupHelp />
          <p className="setup-footnote">
            Your choices are kept when you go back. You can update club details
            and website design after setup.
          </p>
        </section>
      )}
    </SetupFrame>
  );
}
