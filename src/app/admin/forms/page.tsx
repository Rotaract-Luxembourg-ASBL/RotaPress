import type { Metadata } from "next";
import { FormList } from "@/features/forms/ui/form-list";

export const metadata: Metadata = { title: "Forms" };

export default function FormsPage() {
  return <FormList />;
}
