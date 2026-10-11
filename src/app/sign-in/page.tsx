import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/ui/sign-in-form";
import { services } from "@/composition/services";
import { googleAuthStore } from "@/core/auth/google_configuration";
import { signInDestination } from "@/core/auth/sign_in_destination";
import { PublishedClubBrand } from "@/ui/published-club-brand";
import {
  oauthConnectionError,
  oauthErrorPath,
} from "@/integrations/automation/oauth/errors";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
    reauth?: string | string[];
  }>;
}) {
  const { error, next, reauth } = await searchParams;
  // Older provider errors landed here without a sign-in destination. These are
  // connection failures; signing in cannot restore a removed client registration.
  if (oauthConnectionError(error)) redirect(oauthErrorPath(error));
  if (!(await services.installation.isComplete())) {
    return <SignInForm setup googleError={Boolean(error)} />;
  }
  const policy = await services.organization.signInPolicy();
  const returnTo = signInDestination(typeof next === "string" ? next : null);
  const club = await services.organization.publicIdentity();
  if (policy.googleOnly) {
    const google = await googleAuthStore.current();
    return (
      <SignInForm
        googleOnly
        googleError={Boolean(error)}
        appearance={policy.appearance}
        hostedDomain={google.hostedDomain}
        clubName={club?.name}
        returnTo={returnTo}
        reauth={reauth === "1"}
        brand={club ? <PublishedClubBrand club={club} /> : undefined}
      />
    );
  }
  return (
    <SignInForm
      googleError={Boolean(error)}
      appearance={policy.appearance}
      clubName={club?.name}
      returnTo={returnTo}
      reauth={reauth === "1"}
      brand={club ? <PublishedClubBrand club={club} /> : undefined}
    />
  );
}
