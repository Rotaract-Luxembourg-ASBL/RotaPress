import type { Metadata } from "next";
import { Suspense } from "react";
import { WebsiteWorkspace } from "@/ui/website-workspace";
import { Loading } from "@/ui/primitives";

export const metadata: Metadata = { title: "Website" };

export default function WebsitePage() {
  return <Suspense fallback={<Loading />}><WebsiteWorkspace /></Suspense>;
}
