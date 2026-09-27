"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { errorMessage, request } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import { type AutomationScope } from "../scopes";
import { ScopePicker } from "../ui/scope-picker";
import { ReferenceOrigins } from "../ui/reference-origins";
import {
  defaultOAuthSetup,
  type OAuthPlatform,
  type OAuthSetup,
} from "./client-presets";
import { OAuthSetupFields } from "./oauth-setup-fields";
import {
  OAuthIssuedDetails,
  type IssuedOAuthClient,
} from "./oauth-issued-details";

const endpoint = "/api/admin/integrations/automation/oauth";
export function OAuthSettings({ onManage }: { onManage: () => void }) {
  const [platform, setPlatform] = useState<OAuthPlatform>("chatgpt");
  const [setups, setSetups] = useState<Record<OAuthPlatform, OAuthSetup>>(
    () => ({
      chatgpt: defaultOAuthSetup("chatgpt"),
      claude: defaultOAuthSetup("claude"),
      custom: defaultOAuthSetup("custom"),
    }),
  );
  const setup = setups[platform];
  const [origins, setOrigins] = useState("");
  const [scopes, setScopes] = useState<AutomationScope[]>(["website:read"]);
  const [issued, setIssued] = useState<IssuedOAuthClient>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    setBusy(true);
    setProblem(undefined);
    try {
      setIssued(
        await request<IssuedOAuthClient>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            name: setup.name,
            redirectUris: setup.redirects.split(/\s+/).filter(Boolean),
            authentication: setup.authentication,
            scopes,
            sourceOrigins: scopes.includes("sources:read")
              ? origins
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((origin) => origin.replace(/\/$/, ""))
              : [],
          }),
        }),
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel oauth-settings"
      aria-labelledby="oauth-settings-title"
    >
      <h2 id="oauth-settings-title">Connect with OAuth</h2>
      <p>
        Choose your AI app and its allowed actions. We'll prepare the connection
        details to copy into the app, then you'll sign in and approve access.
      </p>
      <p className="muted">
        Identity confirmation lasts 12 hours in the same browser and network.{" "}
        <Link href="/sign-in?reauth=1&next=/admin/integrations/mcp">
          Sign in again
        </Link>
      </p>
      {problem && <Notice>{problem}</Notice>}
      <form className="automation-form" onSubmit={create} hidden={!!issued}>
        <OAuthSetupFields
          platform={platform}
          onPlatformChange={setPlatform}
          value={setup}
          onChange={(value) =>
            setSetups((previous) => ({ ...previous, [platform]: value }))
          }
          disabled={busy}
        />
        <ScopePicker
          legend="OAuth allowed actions"
          value={scopes}
          onChange={setScopes}
          disabled={busy}
        />
        {scopes.includes("sources:read") && (
          <ReferenceOrigins
            value={origins}
            onChange={setOrigins}
            disabled={busy}
          />
        )}
        <button
          className="button button-accent"
          disabled={busy || !!issued || !scopes.length}
        >
          {busy ? "Working…" : "Create OAuth connection"}
        </button>
      </form>
      {issued && (
        <OAuthIssuedDetails
          issued={issued}
          platform={platform}
          onDone={() => setIssued(undefined)}
        />
      )}
      <p>
        <button className="inline-button" onClick={onManage}>
          Manage existing OAuth connections →
        </button>
      </p>
    </section>
  );
}
