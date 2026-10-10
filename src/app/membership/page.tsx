import type { Metadata } from "next";
import { MembershipPage } from "@/ui/membership-page";
import { PublishedSiteShell } from "@/ui/published-site-shell";
import { services } from "@/composition/services";

export const metadata: Metadata = {
  title: "Member portal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function Membership() {
  const club = await services.organization.publicIdentity();
  return (
    <PublishedSiteShell>
      <MembershipPage club={club} />
    </PublishedSiteShell>
  );
}
