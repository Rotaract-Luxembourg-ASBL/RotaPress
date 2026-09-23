import type { Metadata } from "next";
import { EmailUnsubscribe } from "@/integrations/email/ui/email-unsubscribe";
export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function UnsubscribePage() {
  return (
    <main className="account-page">
      <EmailUnsubscribe />
    </main>
  );
}
