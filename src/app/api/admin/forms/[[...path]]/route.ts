import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { submissionFilterSchema } from "@/features/forms/form_schemas";

type Context = { params: Promise<{ path?: string[] }> };

async function actorFor(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor)
    throw new HttpError(401, "Sign in to manage forms and submissions.");
  return actor;
}

function notFound(): never {
  throw new HttpError(404, "Form operation not found.");
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    if (!path.length) return json({ forms: await services.forms.list(actor) });
    if (path[0] === "submissions") {
      if (path.length !== 2) return notFound();
      return json(await services.submissions.detail(actor, path[1]));
    }
    const id = z.uuid().parse(path[0]);
    if (path.length === 1) return json(await services.forms.detail(actor, id));
    if (path.length === 2 && path[1] === "settings")
      return json(await services.forms.settings(actor, id));
    if (path.length === 2 && path[1] === "webhook")
      return json(await services.formWebhooks.settings(actor, id));
    if (path.length === 2 && path[1] === "retention")
      return json(await services.submissions.retentionPreview(actor, id));
    if (path.length === 2 && path[1] === "deletion")
      return json(await services.formDeletion.review(actor, id));
    if (path[1] === "submissions") {
      const filter = submissionFilterSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (path.length === 2)
        return json(await services.submissions.list(actor, id, filter));
      if (path.length === 3 && path[2] === "export") {
        const csv = await services.submissions.exportCsv(actor, id, filter);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="form-${id}-submissions.csv"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    return notFound();
  });
}

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const body = await readMutation(request, 512 * 1024);
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    await services.limiter.consume("forms-write", actor.userId, 60);
    if (!path.length)
      return json(await services.forms.create(actor, body), 201);
    if (path[0] === "submissions") {
      if (path.length !== 3 || path[2] !== "retry") return notFound();
      z.object({}).strict().parse(body);
      return json(await services.submissions.retryNotification(actor, path[1]));
    }
    if (path.length !== 2) return notFound();
    const id = z.uuid().parse(path[0]);
    switch (path[1]) {
      case "duplicate":
        return json(await services.forms.duplicate(actor, id, body), 201);
      case "save":
        return json(await services.forms.save(actor, id, body));
      case "publish":
        return json(await services.forms.publish(actor, id, body));
      case "archive":
        return json(await services.forms.archive(actor, id, body));
      case "settings":
        return json(await services.forms.updateSettings(actor, id, body));
      case "webhook":
        return json(await services.formWebhooks.save(actor, id, body));
      case "webhook-retry":
        return json(await services.formWebhooks.retry(actor, id, body));
      case "retention":
        return json(await services.submissions.deleteRetained(actor, id, body));
      default:
        return notFound();
    }
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const body = await readMutation(request);
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    if (path.length !== 2 || path[0] !== "submissions") return notFound();
    await services.limiter.consume("forms-write", actor.userId, 60);
    return json(await services.submissions.updateStatus(actor, path[1], body));
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    const body = await readMutation(request);
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    await services.limiter.consume("forms-write", actor.userId, 60);
    if (path.length === 1) {
      await services.formDeletion.delete(actor, path[0], body);
      return json({ deleted: true });
    }
    if (path.length !== 2 || path[0] !== "submissions") return notFound();
    await services.submissions.delete(actor, path[1], body);
    return json({ deleted: true });
  });
}
