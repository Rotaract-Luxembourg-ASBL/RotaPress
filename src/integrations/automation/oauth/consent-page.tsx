import Link from "next/link";
import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { oauthConnections } from "@/composition/automation";
import { OAuthConsent } from "./oauth-consent";
import { Notice } from "@/ui/primitives";
import { PublishedClubBrand } from "@/ui/published-club-brand";
import { AuthShell } from "@/ui/auth-shell";
import "./consent.css";

export async function OAuthConsentPage({
  signedQuery,
}: {
  signedQuery: string | null;
}) {
  const currentHeaders = await headers();
  const actor = await getActor(currentHeaders);
  const club = await services.organization.publicIdentity();
  let details;
  if (actor && signedQuery) {
    try {
      details = await oauthConnections.details(
        actor,
        currentHeaders,
        signedQuery,
      );
    } catch {
      /* No private client details on invalid requests or lost access. */
    }
  }
  return (
    <AuthShell
      mode="connection"
      brand={club ? <PublishedClubBrand club={club} /> : undefined}
      context="AI connection"
      introductionHeading="Connect your AI app"
      description={
        <>
          Review access to {club?.name ?? "your club"} before returning to your
          app. You choose its actions and can revoke access in MCP settings.
        </>
      }
      identity={
        actor ? (
          <div className="oauth-consent-account">
            <span>Signed in as</span>
            <strong>{actor.email}</strong>
          </div>
        ) : undefined
      }
      footer={<Link href="/">Back to club website</Link>}
    >
      {details && signedQuery ? (
        <OAuthConsent
          details={details}
          signedQuery={signedQuery}
          clubName={club?.name ?? "Your club"}
        />
      ) : (
        <section className="oauth-consent-card oauth-consent-unavailable">
          <p className="eyebrow">Connection unavailable</p>
          <h1>Review your AI connection</h1>
          <Notice>
            This request expired or your account cannot authorize it. Start the
            connection again from your AI client.
          </Notice>
          <p>
            Your connection settings and saved club content have not changed.
            Return to the app and open a new connection request.
          </p>
          {!actor && signedQuery && (
            <Link
              className="button button-accent"
              href={`/api/automation/oauth/sign-in?${signedQuery}`}
            >
              Sign in to review access
            </Link>
          )}
          {actor && (
            <Link
              className="button button-outline"
              href="/admin/integrations/mcp"
            >
              Back to MCP
            </Link>
          )}
        </section>
      )}
    </AuthShell>
  );
}
