import type { Metadata } from "next";
import { SignInForm } from "@/ui/sign-in-form";
import { PublishedSiteShell } from "@/ui/published-site-shell";
import { services } from "@/composition/services";
import { googleAuthStore } from "@/core/auth/google_configuration";
import { signInDestination } from "@/core/auth/sign_in_destination";
import { PublishedClubBrand } from "@/ui/published-club-brand";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  if (!(await services.installation.isComplete())) {
    return <SignInForm setup googleError={Boolean(error)} />;
  }
  const policy = await services.organization.signInPolicy();
  const returnTo = signInDestination(next ?? null);
  if (policy.googleOnly) {
    const club = await services.organization.publicIdentity();
    const google = await googleAuthStore.current();
    return (
      <SignInForm
        googleOnly
        googleError={Boolean(error)}
        appearance={policy.appearance}
        hostedDomain={google.hostedDomain}
        clubName={club?.name}
        returnTo={returnTo}
        brand={club ? <PublishedClubBrand club={club} /> : undefined}
      />
    );
  }
  return (
    <PublishedSiteShell>
      <SignInForm
        googleError={Boolean(error)}
        appearance={policy.appearance}
        returnTo={returnTo}
      />
    </PublishedSiteShell>
  );
}
