import { OAuthConsentPage } from "@/integrations/automation/oauth/consent-page";
export const metadata = {
  title: "Review AI connection",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  }
  return <OAuthConsentPage signedQuery={query.toString()} />;
}
