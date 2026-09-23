import type { Metadata } from "next";
import { RecoveryForm } from "@/ui/recovery-form";
import { PublishedSiteShell } from "@/ui/published-site-shell";

export const metadata: Metadata = {
  title: "Owner recovery",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <PublishedSiteShell>
      <RecoveryForm />
    </PublishedSiteShell>
  );
}
