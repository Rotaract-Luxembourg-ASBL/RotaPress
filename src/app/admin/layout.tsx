import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/ui/admin-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { PublishedClubBrand } from "@/ui/published-club-brand";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect("/sign-in?next=/admin");
  if (
    !(await services.authorization.optional(actor)) &&
    !(await services.events.hasAccess(actor))
  )
    redirect("/membership");
  const club = await services.organization.publicIdentity();
  return (
    <AdminShell brand={club ? <PublishedClubBrand club={club} /> : null}>
      {children}
    </AdminShell>
  );
}
