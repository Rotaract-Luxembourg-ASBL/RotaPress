import { GuestEvent } from "@/features/guests/ui/guest-portal";
export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string; id: string }>;
}) {
  return <GuestEvent {...await params} />;
}
