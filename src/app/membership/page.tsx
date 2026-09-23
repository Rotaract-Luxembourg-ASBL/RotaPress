import type { Metadata } from "next";
import { MembershipPage } from "@/ui/membership-page";
import { PublishedSiteShell } from "@/ui/published-site-shell";
import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { PublishedClubBrand } from "@/ui/published-club-brand";

export const metadata: Metadata = {
  title: "Member portal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function Membership() {
  const [actor, club] = await Promise.all([
    getActor(await headers()),
    services.organization.publicIdentity(),
  ]);
  if (actor && club) {
    return (
      <MembershipPage club={club} brand={<PublishedClubBrand club={club} />} />
    );
  }
  return (
    <PublishedSiteShell>
      <MembershipPage />
    </PublishedSiteShell>
  );
}
