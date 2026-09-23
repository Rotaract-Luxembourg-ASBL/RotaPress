import type { Metadata } from "next";
import { SubmissionsList } from "@/features/forms/ui/submissions-list";

export const metadata: Metadata = { title: "Form submissions" };

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubmissionsList formId={id} />;
}
