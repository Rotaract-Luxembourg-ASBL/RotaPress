import { automationContext } from "@/composition/automation";
import { handle, HttpError, json, readBoundedBody } from "@/core/http";
import {
  operations,
  executeOperation,
} from "@/integrations/automation/catalogue";
import { openApiDocument } from "@/integrations/automation/openapi";
import { automationPrompts } from "@/integrations/automation/prompts";
import { requireAutomationOrigin } from "@/integrations/automation/http_boundary";
import { withOAuthChallenge } from "@/integrations/automation/oauth/challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function dispatch(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return withOAuthChallenge(
    await handle(async () => {
      requireAutomationOrigin(request);
      const current = await automationContext(request, "rest");
      const path = `/${(await context.params).path.join("/")}`;
      if (request.method === "GET" && path === "/openapi.json")
        return json(openApiDocument());
      if (request.method === "GET" && path === "/prompts")
        return json({ data: automationPrompts });
      // Literal endpoints such as /events/blueprints must win over /events/{id}.
      const candidates = [...operations].sort(
        (a, b) =>
          (a.path.match(/\{/g)?.length ?? 0) -
          (b.path.match(/\{/g)?.length ?? 0),
      );
      for (const operation of candidates) {
        const names: string[] = [];
        const pattern = operation.path.replace(
          /\{([^}]+)\}/g,
          (_match, name: string) => {
            names.push(name);
            return "([^/]+)";
          },
        );
        const match = new RegExp(`^${pattern}$`).exec(path);
        if (!match || request.method !== operation.method) continue;
        const url = new URL(request.url);
        if (
          [...url.searchParams.keys()].some(
            (key) => url.searchParams.getAll(key).length !== 1,
          )
        )
          throw new HttpError(
            400,
            "Repeated query parameters are not allowed.",
          );
        const body: unknown =
          request.method === "GET"
            ? Object.fromEntries(
                [...url.searchParams].map(([key, value]) => [
                  key,
                  ["limit", "offset"].includes(key) && /^\d+$/.test(value)
                    ? Number(value)
                    : value,
                ]),
              )
            : await jsonInput(request);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new HttpError(400, "Use a JSON object.");
        for (let index = 0; index < names.length; index++) {
          if (names[index] in body)
            throw new HttpError(
              400,
              "Path parameters must not be repeated in the body or query.",
            );
        }
        const input = {
          ...body,
          ...Object.fromEntries(
            names.map((name, index) => [name, match[index + 1]]),
          ),
        };
        return json({
          data: await executeOperation(current, operation.name, input),
        });
      }
      throw new HttpError(404, "This operation is unavailable.");
    }),
  );
}
async function jsonInput(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new HttpError(415, "Use application/json.");
  const body = await readBoundedBody(request, 262144);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Use valid JSON.");
  }
}
export { dispatch as GET, dispatch as POST, dispatch as PATCH };
