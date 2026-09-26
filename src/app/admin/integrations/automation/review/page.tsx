import { AutomationReview } from "@/integrations/automation/ui/automation-review";
export const metadata = { title: "Review AI event suggestions" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  return <AutomationReview eventId={(await searchParams).eventId ?? ""} />;
}
