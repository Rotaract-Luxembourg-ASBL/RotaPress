import type { Metadata } from "next";
import { SignInForm } from "@/ui/sign-in-form";
import { PublishedSiteShell } from "@/ui/published-site-shell";
import { services } from "@/composition/services";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!(await services.installation.isComplete())) {
    return <SignInForm setup googleError={Boolean(error)} />;
  }
  return (
    <PublishedSiteShell>
      <SignInForm googleError={Boolean(error)} />
    </PublishedSiteShell>
  );
}
