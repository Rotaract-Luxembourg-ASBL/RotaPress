import type { Metadata } from "next";
import { SettingsPanel } from "@/ui/settings-panel";

export const metadata: Metadata = { title: "Club settings" };

export default function SettingsPage() {
  return <SettingsPanel />;
}
