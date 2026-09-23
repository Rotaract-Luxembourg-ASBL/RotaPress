import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { z } from "zod";

type Context = { params: Promise<{ path?: string[] }> };
async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage event drafts.");
  return current;
}
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const current = await actor(request);
    const path = (await context.params).path ?? [];
    if (path[1] === "draws") {
      await services.limiter.consume("draw-read", current.userId, 90);
      if (path.length === 2)
        return json(await services.eventDraws.workspace(current, path[0]));
      if (path.length === 3 && path[2] === "published")
        return json(await services.eventDraws.published(current, path[0]));
    }
    if (path[1] === "entries")
      await services.limiter.consume("entry-read", current.userId, 120);
    if (path.length === 2 && path[1] === "entries")
      return json(await services.eventEntries.workspace(current, path[0]));
    if (path.length === 3 && path[1] === "entries" && path[2] === "bookings")
      return json(await services.eventEntries.bookings(current, path[0]));
    if (path.length === 4 && path[1] === "entries" && path[2] === "bookings")
      return json(
        await services.eventEntries.bookingOrders(current, path[0], path[3]),
      );
    if (
      path.length === 4 &&
      path[1] === "luma-guests" &&
      path[3] === "purchases"
    ) {
      await services.limiter.consume("purchase-read", current.userId, 90);
      return json(
        await services.purchases.workspace(current, path[0], path[2]),
      );
    }
    if (path.length === 2 && path[1] === "packages")
      return json(await services.eventPackages.workspace(current, path[0]));
    if (path.length === 2 && path[1] === "prizes")
      return json(await services.eventPrizes.workspace(current, path[0]));
    if (path.length === 2 && path[1] === "readiness")
      return json(await services.eventReadiness.read(current, path[0]));
    if (path.length === 2 && path[1] === "history")
      return json(await services.eventEditorial.history(current, path[0]));
    if (path.length === 2 && path[1] === "guests")
      return json(await services.guests.workspace(current, path[0]));
    if (path.length === 1 && path[0] === "catalogue")
      return json({
        items: await services.eventWebsite.catalogue(
          current,
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      });
    if (path.length === 2 && path[1] === "luma-api")
      return json({
        ...(await services.lumaApiEvents.workspace(
          current,
          path[0],
          new URL(request.url).searchParams.get("sourceId") ?? undefined,
        )),
        jobs: await services.lumaJobs.history(
          current,
          path[0],
          new URL(request.url).searchParams.get("sourceId") ?? undefined,
        ),
      });
    if (path.length === 2 && path[1] === "luma")
      return json(await services.lumaLinks.workspace(current, path[0]));
    if (!path.length)
      return json({ events: await services.events.list(current) });
    if (path.length === 1 && path[0] === "managers")
      return json({ managers: await services.events.managers(current) });
    if (path.length === 2 && path[1] === "cancellation")
      return json(await services.eventCancellation.preview(current, path[0]));
    if (path.length === 2 && path[1] === "registration")
      return json(await services.registrations.workspace(current, path[0]));
    if (path.length === 2 && path[1] === "registration-preview")
      return json(await services.registrations.editorPreview(current, path[0]));
    if (path.length === 2 && path[1] === "registrations")
      return json({
        registrations: await services.registrations.list(current, path[0]),
      });
    if (path.length === 2 && path[1] === "forms")
      return json({ forms: await services.forms.eventForms(current, path[0]) });
    if (path.length === 2 && path[1] === "team")
      return json(await services.events.team(current, path[0]));
    if (path.length === 2 && path[1] === "website")
      return json(await services.eventWebsite.workspace(current, path[0]));
    if (path.length === 2 && path[1] === "media") {
      await services.events.detail(current, path[0]);
      return json({ assets: await services.media.publicLibrary(current) });
    }
    if (path.length === 1)
      return json(await services.events.detail(current, path[0]));
    throw new HttpError(404, "This event operation is unavailable.");
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const body = z
      .record(z.string(), z.unknown())
      .parse(await readMutation(request));
    const current = await actor(request);
    const path = (await context.params).path ?? [];
    if (path[1] === "draws") {
      await services.limiter.consume("draw-write", current.userId, 30);
      if (path.length === 2)
        return json(await services.eventDraws.freeze(current, path[0], body));
      if (path.length === 4 && path[3] === "run")
        return json(
          await services.eventDraws.run(current, path[0], path[2], body),
        );
      if (path.length === 4 && path[3] === "review")
        return json(
          await services.eventDraws.review(current, path[0], path[2], body),
        );
    }
    if (path[1] === "entries")
      await services.limiter.consume("entry-write", current.userId, 60);
    if (
      path.length === 5 &&
      path[1] === "luma-guests" &&
      path[3] === "purchases" &&
      path[4] === "refresh"
    ) {
      await services.limiter.consume("purchase-refresh", current.userId, 20);
      return json(
        await services.purchases.refresh(current, path[0], path[2], body),
      );
    }
    if (path.length === 2 && path[1] === "packages")
      return json(await services.eventPackages.save(current, path[0], body));
    if (path.length === 2 && path[1] === "entries")
      return json(await services.eventEntries.create(current, path[0], body));
    if (path.length === 4 && path[1] === "entries" && path[3] === "review")
      return json(
        await services.eventEntries.review(current, path[0], path[2], body),
      );
    if (path.length === 2 && path[1] === "prizes")
      return json(await services.eventPrizes.save(current, path[0], body));
    if (path.length === 4 && path[1] === "prizes" && path[3] === "publication")
      return json(
        await services.eventPrizes.publication(current, path[0], path[2], body),
      );
    if (path.length === 3 && path[1] === "packages" && path[2] === "sources")
      return json(await services.eventPackages.source(current, path[0], body));
    if (
      path.length === 4 &&
      path[1] === "packages" &&
      path[2] === "sources" &&
      !("id" in body)
    )
      return json(
        await services.eventPackages.source(current, path[0], {
          ...body,
          id: path[3],
        }),
      );
    if (
      path.length === 4 &&
      path[1] === "packages" &&
      path[3] === "publication"
    )
      return json(
        await services.eventPackages.publication(
          current,
          path[0],
          path[2],
          body,
        ),
      );
    if (path.length === 2 && path[1] === "preview") {
      await services.limiter.consume("cms-preview", current.userId, 90);
      return json(
        await services.previews.createEvent(current, { ...body, id: path[0] }),
      );
    }
    if (path.length === 2 && path[1] === "restore")
      return json(
        await services.eventEditorial.restore(current, {
          ...body,
          id: path[0],
        }),
      );
    if (path.length === 2 && path[1] === "featured")
      return json(
        await services.eventEditorial.feature(current, {
          ...body,
          id: path[0],
        }),
      );
    if (path.length === 2 && path[1] === "guests")
      return json(await services.guests.grant(current, path[0], body), 201);
    if (path.length === 4 && path[1] === "guests" && path[3] === "revoke")
      return json(
        await services.guests.revoke(current, path[0], path[2], body),
      );
    if (path.length === 2 && path[1] === "luma")
      return json(await services.lumaLinks.save(current, path[0], body));
    if (path.length === 3 && path[1] === "luma-api") {
      if (path[2] === "link")
        return json(await services.lumaApiEvents.link(current, path[0], body));
      if (path[2] === "configure")
        return json(
          await services.lumaApiEvents.configure(current, path[0], body),
        );
      if (path[2] === "reconcile")
        return json(
          {
            jobs: await services.lumaJobs.enqueue(current, path[0], body),
          },
          202,
        );
      if (path[2] === "cancel")
        return json({
          jobs: await services.lumaJobs.cancel(current, path[0], body),
        });
    }
    if (path.length === 3 && path[1] === "luma" && path[2] === "publication")
      return json(await services.lumaLinks.publication(current, path[0], body));
    if (path.length === 1 && path[0] === "template-preview")
      return json(await services.eventTemplates.preview(current, body));
    if (path.length === 1 && path[0] === "from-template")
      return json(await services.eventTemplates.create(current, body), 201);
    if (path.length === 2 && path[1] === "cancellation" && !("id" in body))
      return json(
        await services.eventCancellation.cancel(current, {
          ...body,
          id: path[0],
        }),
      );
    if (path.length === 2 && path[1] === "registration")
      return json(
        await services.registrations.configure(current, path[0], body),
      );
    if (
      path.length === 4 &&
      path[1] === "registrations" &&
      path[3] === "cancel"
    )
      return json(
        await services.registrations.cancel(current, path[2], body, path[0]),
      );
    if (path.length === 2 && path[1] === "forms")
      return json(
        await services.forms.createEventForm(current, path[0], body),
        201,
      );
    if (path.length === 2 && path[1] === "modules" && !("id" in body))
      return json(
        await services.eventModules.change(current, { ...body, id: path[0] }),
      );
    if (path.length === 2 && path[1] === "publication" && !("id" in body))
      return json(
        await services.eventWebsite.publication(current, {
          ...body,
          id: path[0],
        }),
      );
    if (!path.length)
      return json(await services.events.create(current, body), 201);
    if (path.length === 2 && path[1] === "editors" && !("id" in body))
      return json(
        await services.events.changeEditor(current, { ...body, id: path[0] }),
      );
    if (path.length === 2 && path[1] === "manager" && !("id" in body)) {
      return json(
        await services.events.reassignManager(current, {
          ...body,
          id: path[0],
        }),
      );
    }
    if (path.length === 2 && path[1] === "archive" && !("id" in body)) {
      return json(
        await services.events.archive(current, { ...body, id: path[0] }),
      );
    }
    throw new HttpError(404, "This event operation is unavailable.");
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const body = z
      .record(z.string(), z.unknown())
      .parse(await readMutation(request));
    const current = await actor(request);
    const path = (await context.params).path ?? [];
    if (path.length !== 1 || "id" in body)
      throw new HttpError(400, "Choose an event draft in the URL.");
    return json(await services.events.save(current, { ...body, id: path[0] }));
  });
}
