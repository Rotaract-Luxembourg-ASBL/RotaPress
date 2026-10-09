import type { Metadata } from "next";
import { SignInForm } from "@/ui/sign-in-form";
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
  searchParams: Promise<{ error?: string; next?: string; reauth?: string }>;
}) {
  const { error, next, reauth } = await searchParams;
  if (!(await services.installation.isComplete())) {
    return <SignInForm setup googleError={Boolean(error)} />;
  }
  const policy = await services.organization.signInPolicy();
  const returnTo = signInDestination(next ?? null);
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
