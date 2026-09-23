import "server-only";

import { headers } from "next/headers";
import { getActor } from "@/core/auth/actor";
import { DomainError } from "@/core/authorization/AuthorizationService";
import { services } from "@/composition/services";
import { PublicFormContent } from "@/features/forms/ui/public-form";
import { LumaRegistrationCard } from "@/integrations/luma/ui/luma-registration-card";

function unavailable(error: unknown): null {
  if (error instanceof DomainError && error.status === 404) return null;
  throw error;
}

export async function EventFormBlock({
  eventId,
  formId,
}: {
  eventId: string;
  formId: string;
}) {
  const form = await services.forms
    .publicForm(formId, await getActor(await headers()))
    .catch(unavailable);
  if (!form || form.eventId !== eventId) return null;
  return (
    <section className="cms-block">
      <PublicFormContent form={form} />
    </section>
  );
}

export async function EventRegistrationBlock({
  eventId,
  locale,
}: {
  eventId: string;
  locale: string;
}) {
  const actor = await getActor(await headers());
  const lumaUrl = await services.lumaLinks.publicLink(actor, eventId);
  if (lumaUrl)
    return (
      <section className="cms-block">
        <LumaRegistrationCard url={lumaUrl} />
      </section>
    );
  const registration = await services.registrations
    .publicForm(actor, eventId)
    .catch(unavailable);
  if (!registration) return null;
  return (
    <section className="cms-block" aria-label="Event registration">
      {!registration.open || registration.full ? (
        <>
          <h2>Event registration</h2>
          <p>
            {registration.full
              ? "This event is full."
              : "Registration is closed."}
          </p>
        </>
      ) : (
        <PublicFormContent
          form={registration.form}
          signInReturnTo={`/events/${eventId}/${locale}/website`}
        />
      )}
    </section>
  );
}
