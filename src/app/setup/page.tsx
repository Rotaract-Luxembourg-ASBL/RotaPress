import type { Metadata } from "next";
import { SetupForm } from "@/ui/setup-form";

export const metadata: Metadata = {
  title: "Set up your club",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupForm />;
}
