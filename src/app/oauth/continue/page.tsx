import { cookies } from "next/headers";
import { OAuthConsentPage } from "@/integrations/automation/oauth/consent-page";
import {
  decodePendingOAuth,
  pendingOAuthCookie,
} from "@/integrations/automation/oauth/pending";

export const metadata = {
  title: "Review AI connection",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";

/** Public handoff; the consent service validates identity, ownership and signed state. */
export default async function Page() {
  return (
    <OAuthConsentPage
      signedQuery={decodePendingOAuth(
        (await cookies()).get(pendingOAuthCookie)?.value,
      )}
    />
  );
}
