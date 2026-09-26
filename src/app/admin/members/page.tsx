import type { Metadata } from "next";
import { MembersPanel } from "@/ui/members-panel";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return <MembersPanel key={status ?? "approved"} initialView={status} />;
}
