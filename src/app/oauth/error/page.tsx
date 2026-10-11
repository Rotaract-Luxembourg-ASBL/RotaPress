import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { oauthConnectionError } from "@/integrations/automation/oauth/errors";
import { AuthShell } from "@/ui/auth-shell";
import { PublishedClubBrand } from "@/ui/published-club-brand";
import { Arrow, Notice } from "@/ui/primitives";

export const metadata: Metadata = {
  title: "AI connection unavailable",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function OAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const code = oauthConnectionError((await searchParams).error);
  const actor = await getActor(await headers());
  const club = await services.organization.publicIdentity();
  const invalidClient = code === "invalid_client" || code === "client_disabled";

  return (
    <AuthShell
      brand={club ? <PublishedClubBrand club={club} /> : undefined}
      context="AI connection"
      introductionHeading="Reconnect your AI app."
      description="Check your connection details, then start a new request from your AI app to review its access."
      identity={
        actor ? (
          <p>
            Signed in as <strong>{actor.email}</strong>
          </p>
        ) : undefined
      }
    >
      <section className="auth-card" aria-labelledby="oauth-error-title">
        <header className="auth-card-heading">
          <h1 id="oauth-error-title">AI connection unavailable</h1>
          <p>This connection could not be started.</p>
        </header>
        <Notice>
          {invalidClient
            ? "Your AI app's connection details are missing or no longer valid."
            : "This connection request is invalid, expired or no longer authorized. Start a new request from your AI app."}
        </Notice>
        {invalidClient ? (
          <p>
            Open MCP settings and check the connection. If its registration was
            removed, create a new OAuth connection and update the client ID and
            secret in your AI app. Then connect again from that app.
          </p>
        ) : (
          <p>
            Check the connection in MCP settings if the problem continues. Your
            club content is kept.
          </p>
        )}
        <div className="auth-actions">
          <Link
            className="button button-accent button-full"
            href={
              actor
                ? "/admin/integrations/mcp"
                : "/sign-in?next=%2Fadmin%2Fintegrations%2Fmcp"
            }
          >
            {actor ? "Open MCP settings" : "Sign in to MCP settings"} <Arrow />
          </Link>
        </div>
        <p className="auth-policy">
          Revoke access stops the app and requires fresh consent. Remove
          connection also removes its registration and requires new connection
          details.
        </p>
      </section>
    </AuthShell>
  );
}
