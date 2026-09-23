import type { Metadata } from "next";
import { PartnerLibrary } from "@/features/partners/ui/partner-library";
export const metadata: Metadata = { title: "Partners & Sponsors" };
export default function PartnersPage() {
  return <PartnerLibrary />;
}
