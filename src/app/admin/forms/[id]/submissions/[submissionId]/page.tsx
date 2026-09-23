import type { Metadata } from "next";
import { SubmissionDetail } from "@/features/forms/ui/submission-detail";

export const metadata: Metadata = { title: "Submission review" };

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  return <SubmissionDetail formId={id} submissionId={submissionId} />;
}
