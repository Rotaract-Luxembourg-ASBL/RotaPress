import { GuestInvitations } from "@/features/guests/ui/guest-portal";
import { headers } from "next/headers";
import Link from "next/link";
import { getActor } from "@/core/auth/actor";

export default async function Page() {
  if (await getActor(await headers())) return <GuestInvitations />;
  return (
    <>
      <p className="eyebrow">Your event space</p>
      <h1>Guest portal</h1>
      <p className="muted">
        Your invitations, event details and booking status in one private place.
      </p>
      <p>
        Invited to an event? Sign in with the email address you shared with the
        event team. You will receive a code to verify your identity.
      </p>
      <div className="form-actions">
        <Link href="/sign-in?next=/guest" className="button button-accent">
          Sign in
        </Link>
        <Link href="/events" className="text-link">
          Browse events
        </Link>
      </div>
      <p className="small muted">
        No club membership is needed. An invitation from the event team gives
        access only to your own booking.
      </p>
    </>
  );
}
