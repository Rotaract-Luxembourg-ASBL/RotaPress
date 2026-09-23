import type { Metadata } from "next";
import { SignInForm } from "@/ui/sign-in-form";
import { PublishedSiteShell } from "@/ui/published-site-shell";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <PublishedSiteShell>
      <SignInForm googleError={Boolean(error)} />
    </PublishedSiteShell>
  );
}
