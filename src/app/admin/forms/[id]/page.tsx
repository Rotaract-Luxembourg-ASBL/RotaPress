import type { Metadata } from "next";
import { FormBuilder } from "@/features/forms/ui/form-builder";

export const metadata: Metadata = { title: "Edit form" };

export default async function FormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormBuilder formId={id} />;
}
