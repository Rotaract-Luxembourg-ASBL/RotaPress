import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";

type Context = { params: Promise<{ path: string[] }> };

async function actorFor(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor) throw new HttpError(401, "Sign in to manage your website.");
  return actor;
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path;
    const locale = cmsLocaleSchema.parse(
      new URL(request.url).searchParams.get("locale") ?? "en",
    );
    if (path.length === 1 && path[0] === "content")
      return json({ items: await services.cms.list(actor) });
    if (path.length === 1 && path[0] === "page-cards") {
      await services.authorization.require(actor, "cms.edit");
      return json({ items: await services.cms.publicPageCards(locale) });
    }
    if (path.length === 3 && path[0] === "content" && path[2] === "schedule")
      return json(
        await services.publicationSchedule.workspace(actor, path[1], locale),
      );
    if (path.length === 1 && path[0] === "site")
      return json(await services.cms.getSite(actor, locale));
    if (path.length === 1 && path[0] === "website")
      return json(await services.websiteSetup.workspace(actor, locale));
    if (path.length === 2 && path[0] === "website" && path[1] === "review")
      return json(await services.websiteSetup.reviewPublication(actor, locale, new URL(request.url).searchParams.get("scope") ?? "website"));
    if (path.length === 2 && path[0] === "site" && path[1] === "preview")
      return json(await services.cms.previewSite(actor, locale));
    if (path.length === 2 && path[0] === "site" && path[1] === "context") {
      const eventId = new URL(request.url).searchParams.get("eventId");
      if (eventId) await services.events.detail(actor, z.uuid().parse(eventId));
      else await services.authorization.require(actor, "cms.edit");
      const [site, club] = await Promise.all([
        services.cms.publicSite(locale),
        services.organization.publicIdentity(),
      ]);
      return json({ site, clubName: club?.name ?? "RotaPress" });
    }
    if (path[0] === "content" && path.length >= 2 && path.length <= 3) {
      const detail = await services.cms.detail(actor, path[1], locale);
      if (path.length === 2) return json(detail);
      if (path[2] === "revisions") return json({ revisions: detail.revisions });
      if (path[2] === "affected") return json({ pages: detail.affectedPages });
    }
    throw new HttpError(404, "Website operation not found.");
  });
}

async function mutate(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path;
    const body = z
      .record(z.string(), z.unknown())
      .parse(await readMutation(request, 256 * 1024));
    if ("id" in body)
      throw new HttpError(400, "Content identity belongs in the URL.");
    if (path.length === 3 && path[0] === "content" && path[2] === "preview") {
      await services.limiter.consume("cms-preview", actor.userId, 90);
      return json(
        await services.previews.create(actor, { ...body, id: path[1] }),
      );
    }
    await services.limiter.consume("cms-write", actor.userId, 60);
    if (path.length === 2 && path[0] === "website" && path[1] === "template")
      return json(await services.websiteSetup.useTemplate(actor, body));
    if (path.length === 2 && path[0] === "website" && path[1] === "publish")
      return json(await services.websiteSetup.publish(actor, body));
    if (path.length === 1 && path[0] === "kits")
      return json(await services.kits.import(actor, body), 201);
    if (path.length === 1 && path[0] === "starter") {
      z.object({}).strict().parse(body);
      return json(await services.starter.create(actor));
    }
    if (path.length === 1 && path[0] === "content")
      return json(await services.cms.create(actor, body), 201);
    if (path.length === 1 && path[0] === "site")
      return json(await services.cms.saveSite(actor, body));
    if (
      path.length === 2 &&
      path[0] === "site" &&
      path[1] === "activate-appearance"
    )
      return json(await services.cms.activateAppearance(actor, body));
    if (
      path.length === 2 &&
      path[0] === "site" &&
      path[1] === "restore-appearance"
    )
      return json(await services.cms.restoreAppearance(actor, body));
    if (path.length === 2 && path[0] === "site" && path[1] === "publish") {
      return json(await services.cms.publishSite(actor, body));
    }
    if (path[0] === "content" && path.length === 3) {
      const input = { ...body, id: path[1] };
      switch (path[2]) {
        case "schedule":
          return json(
            await services.publicationSchedule.schedule(actor, input),
          );
        case "cancel-schedule":
          return json(await services.publicationSchedule.cancel(actor, input));
        case "save":
          return json(await services.cms.save(actor, input));
        case "publish":
          return json(await services.cms.publish(actor, input));
        case "unpublish":
          return json(await services.cms.unpublish(actor, input));
        case "archive":
          return json(await services.cms.archive(actor, input));
        case "restore":
          return json(await services.cms.restore(actor, input));
        case "duplicate":
          return json(await services.cms.duplicate(actor, input), 201);
        case "locale":
          return json(await services.cms.addLocale(actor, input), 201);
        default:
          throw new HttpError(404, "Website operation not found.");
      }
    }
    throw new HttpError(404, "Website operation not found.");
  });
}

export const POST = mutate;
export const PATCH = mutate;
