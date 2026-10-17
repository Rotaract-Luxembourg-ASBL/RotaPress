import { DomainError } from "@/core/DomainError";
import { eventFields } from "@/features/events/event_schemas";
import type { AutomationContext } from "./operation";
import type { AutomationScope } from "./scopes";
import { scopeDefinitions } from "./scopes";
import type { EventTemplateSelection } from "@/features/events/event_templates";
import { eventPresets } from "@/features/events/event_templates";
import { eventPageEditorHref } from "@/features/events/event_routes";
import type { Transaction } from "@/core/authorization/AuthorizationService";

export function requireScopes(
  context: AutomationContext,
  scopes: AutomationScope[],
) {
  for (const scope of scopes)
    if (!context.principal.scopes.includes(scope))
      throw new DomainError(
        "AUTOMATION_SCOPE_REQUIRED",
        `This connection needs ${scope}.`,
        403,
      );
}
export async function requirePreparationScopes(
  context: AutomationContext,
  template: EventTemplateSelection,
  executor?: Transaction,
) {
  const scopes: AutomationScope[] = [
    "events:write",
    "website:write",
    "website:read",
  ];
  const modules =
    template.kind === "preset"
      ? (template.selectedModules ?? eventPresets[template.id].features)
      : null;
  if (template.kind === "copy") scopes.push("events:read");
  if (!modules || modules.includes("forms"))
    scopes.push("forms:read", "forms:write");
  requireScopes(context, scopes);
  for (const capability of new Set(
    scopes.map((scope) => scopeDefinitions[scope].capability),
  )) {
    const current = await context.services.authorization.require(
      context.principal.actor,
      capability,
      executor,
    );
    if (current.organizationId !== context.principal.organizationId)
      throw new DomainError(
        "AUTOMATION_ORGANIZATION_CHANGED",
        "Create a connection for the current club.",
        403,
      );
  }
}
export async function preparedEvent(
  context: AutomationContext,
  id: string,
  executor?: Transaction,
) {
  const { services: s, principal: p } = context;
  const event = await s.events.detail(p.actor, id, executor);
  const pages = p.scopes.includes("website:read")
    ? await s.cms.eventPages(p.actor, id, executor)
    : [];
  const formPage = p.scopes.includes("forms:read")
    ? await s.forms.collection.list(
        p.actor,
        { pageSize: 100, status: "all" },
        id,
        executor,
      )
    : { forms: [], total: 0 };
  const forms = formPage.forms;
  return {
    event: {
      ...eventFields(event),
      id: event.id,
      slug: event.slug,
      version: event.version,
      archived: event.archived,
      cancelled: event.cancelled,
      published: event.published,
    },
    reviewUrl: `/admin/events/${event.id}`,
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      locale: page.locale,
      moduleKey: page.moduleKey ?? null,
      reviewUrl: eventPageEditorHref(event.id, page.id, page.locale),
    })),
    formsPage: {
      total: formPage.total,
      nextOffset: formPage.total > forms.length ? forms.length : null,
    },
    forms: forms.map((form) => ({
      id: form.id,
      title: form.draft.title,
      kind: form.kind,
      draftRevision: form.draftRevision,
      reviewUrl: `/admin/forms/${form.id}`,
    })),
  };
}
