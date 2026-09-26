import Link from "next/link";
import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { oauthConnections } from "@/composition/automation";
import { OAuthConsent } from "./oauth-consent";
import { Notice } from "@/ui/primitives";
import "./consent.css";

export async function OAuthConsentPage({
  signedQuery,
}: {
  signedQuery: string | null;
}) {
  const currentHeaders = await headers();
  const actor = await getActor(currentHeaders);
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
    <main id="main-content" className="oauth-consent-page">
      <div className="oauth-consent-shell">
        {details && signedQuery ? (
          <>
            <p className="oauth-consent-identity">
              Signed in as {actor?.email}
            </p>
            <OAuthConsent details={details} signedQuery={signedQuery} />
          </>
        ) : (
          <section className="oauth-consent-card">
            <h1>Review your AI connection</h1>
            <Notice>
              This request expired or your account cannot authorize it. Start
              the connection again from your AI client.
            </Notice>
            {!actor && signedQuery && (
              <Link
                className="button button-accent"
                href={`/api/automation/oauth/sign-in?${signedQuery}`}
              >
                Sign in to review access
              </Link>
            )}
            <p className="oauth-consent-return">
              <Link href="/admin/integrations/mcp">Back to MCP</Link>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
