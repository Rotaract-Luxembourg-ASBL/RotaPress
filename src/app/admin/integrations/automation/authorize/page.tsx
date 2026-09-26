import { cookies } from "next/headers";
import { OAuthConsentPage } from "@/integrations/automation/oauth/consent-page";
import {
  decodePendingOAuth,
  pendingOAuthCookie,
} from "@/integrations/automation/oauth/pending";
export const metadata = {
  title: "Review AI connection",
  referrer: "no-referrer" as const,
};
export default async function Page() {
  return (
    <OAuthConsentPage
      signedQuery={decodePendingOAuth(
        (await cookies()).get(pendingOAuthCookie)?.value,
      )}
    />
  );
}
