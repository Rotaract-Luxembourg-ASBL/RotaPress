import { z } from "zod";
import { publicationFor } from "./publication_policy";
import { operation } from "./operation";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptEvent } from "./receipt_authority";
import { exampleId, eventExample } from "./examples";
import { eventPresets } from "@/features/events/event_templates";
import { eventModules } from "@/features/events/event_modules";
import { packageSaveSchema } from "@/features/events/package_schemas";
import { prizeSaveSchema } from "@/features/events/prize_schemas";
import { formOutput } from "./response_schemas";
import { preparedEvent, requirePreparationScopes } from "./event_preparation";
import {
  eventPreparationInput,
  eventPreparationCreate,
  eventPreparationReview,
  preparedEventOutput,
  eventContentWorkspaceOutput,
  packageItemOutput,
  prizeItemOutput,
} from "./event_preparation_schemas";

const idInput = z.strictObject({ id: z.uuid() });
const preparationExample = {
  event: eventExample,
  template: { kind: "preset", id: "networking" },
};
export const eventOperations = [
  operation(
    {
      name: "events_blueprints",
      effect: "read",
      path: "/events/blueprints",
      method: "GET",
      scope: "events:read",
      description:
        "Discover native starting presets and feature dependencies. Native registration starts closed; nothing is published.",
      input: z.strictObject({}),
      example: {},
      output: z.strictObject({
        presets: z.array(
          z.strictObject({
            id: z.string(),
            label: z.string(),
            description: z.string(),
            features: z.array(z.string()),
          }),
        ),
        modules: z.array(
          z.strictObject({
            key: z.string(),
            label: z.string(),
            description: z.string(),
            dependencies: z.array(z.string()),
          }),
        ),
      }),
    },
    async () => ({
      presets: Object.entries(eventPresets).map(([id, preset]) => ({
        id,
        ...preset,
      })),
      modules: Object.entries(eventModules).map(([key, module]) => ({
        key,
        ...module,
      })),
    }),
  ),
  operation(
    {
      name: "events_prepare_preview",
      effect: "read",
      path: "/events/preparation/preview",
      method: "POST",
      scope: "events:prepare",
      readOnly: true,
      description:
        "Review the exact native preset or accessible event copy before creating a private event. Requires website read/write and events write; forms read/write for forms or copies. Returns a snapshot token, not publication approval.",
      input: eventPreparationInput,
      output: eventPreparationReview,
      example: preparationExample,
    },
    async (context, input) => {
      await requirePreparationScopes(context, input.template);
      return context.services.eventTemplates.preview(context.principal.actor, {
        ...input,
        event: {
          ...input.event,
          managerUserId: context.principal.actor.userId,
        },
      });
    },
  ),
  receiptOperation(
    {
      name: "events_prepare",
      effect: "draft",
      path: "/events/preparation",
      method: "POST",
      scope: "events:prepare",
      description:
        "Create the reviewed event, linked page/form drafts and closed registration atomically. Retry only the same requestId, snapshot token and payload. Current staff identity becomes manager; participant/provider data is never copied.",
      input: eventPreparationCreate,
      output: preparedEventOutput,
      example: {
        ...preparationExample,
        requestId: exampleId,
        reviewToken: "a".repeat(64),
      },
    },
    async (context, input, tx) => {
      await requirePreparationScopes(context, input.template, tx);
      if (input.template.kind === "copy")
        await requireReceiptEvent(
          context,
          input.template.id,
          "events.edit",
          tx,
        );
    },
    async (context, input, tx) => {
      const event = await context.services.eventTemplates.create(
        context.principal.actor,
        {
          ...input,
          event: {
            ...input.event,
            managerUserId: context.principal.actor.userId,
          },
          confirmed: true,
        },
        tx,
      );
      return preparedEvent(context, event.id, tx);
    },
  ),
  operation(
    {
      name: "events_workspace",
      effect: "read",
      path: "/events/{id}/preparation",
      method: "GET",
      scope: "events:read",
      description:
        "Read scoped event pages/forms, feature readiness and registration configuration without participant identities, answers or counts. Page/form summaries need their separate read scopes. Returns human review links and publication blockers.",
      input: idInput,
      output: eventContentWorkspaceOutput,
      example: { id: exampleId },
    },
    async (context, { id }) => {
      const { services: s, principal: p } = context;
      const [event, readiness, registration] = await Promise.all([
        preparedEvent(context, id),
        s.eventReadiness.read(p.actor, id),
        s.registrations.workspace(p.actor, id),
      ]);
      return {
        event,
        modules: readiness.modules,
        registration: {
          authority: registration.authority,
          formId: registration.formId,
          capacity: registration.capacity,
          open: registration.open,
          version: registration.version,
          externalLocked: registration.externalLocked,
        },
        blockers: [
          ...new Set([
            ...readiness.modules.flatMap((m) => m.reasons),
            ...readiness.forms.reasons,
            ...readiness.registration.reasons,
          ]),
        ],
        publication: publicationFor(p.scopes, "events"),
      };
    },
  ),
  receiptOperation(
    {
      name: "events_form_create",
      effect: "draft",
      path: "/events/{id}/forms",
      method: "POST",
      scope: "forms:write",
      description:
        "Create a private enquiry or registration form for an authorized event with Forms enabled. Never opens registration, submits responses or sends mail.",
      input: z.strictObject({
        id: z.uuid(),
        kind: z.enum(["event", "registration"]),
        title: z.string().trim().min(1).max(160),
      }),
      output: formOutput,
      example: {
        id: exampleId,
        kind: "registration",
        title: "Dinner registration",
      },
    },
    (context, { id }, tx) =>
      requireReceiptEvent(context, id, "events.edit", tx),
    async ({ services: s, principal: p }, { id, ...input }, tx) => {
      const form = await s.forms.createEventForm(p.actor, id, input, tx);
      return {
        id: form.id,
        kind: form.kind,
        archived: form.archived,
        draftRevision: form.draftRevision,
        draft: form.draft,
        publishedVersionId: form.publishedVersionId,
      };
    },
  ),
  operation(
    {
      name: "events_packages",
      effect: "read",
      path: "/events/{id}/packages",
      method: "GET",
      scope: "events:read",
      description:
        "Read scoped event package content and draft versions; no purchases or participant information.",
      input: idInput,
      output: z.strictObject({ items: z.array(packageItemOutput) }),
      example: { id: exampleId },
    },
    async ({ services: s, principal: p }, { id }) => ({
      items: (await s.eventPackages.workspace(p.actor, id)).packages.map(
        ({ published, ...item }) => ({
          ...item,
          published: Boolean(published),
        }),
      ),
    }),
  ),
  receiptOperation(
    {
      name: "events_package_save",
      effect: "draft",
      path: "/events/{eventId}/packages",
      method: "PATCH",
      scope: "events:prepare",
      description:
        "Save a private package draft using its version. Payment checkout stays disabled in automation. Does not publish, connect providers or create purchases.",
      input: packageSaveSchema.extend({
        eventId: z.uuid(),
        draft: packageSaveSchema.shape.draft.extend({
          checkoutEnabled: z.literal(false),
        }),
      }),
      output: z.strictObject({ items: z.array(packageItemOutput) }),
      example: {
        eventId: exampleId,
        expectedVersion: 0,
        sourceId: null,
        draft: {
          title: "Dinner",
          description: "Dinner package",
          priceMinor: 0,
          currency: "EUR",
          showPrice: false,
          checkoutEnabled: false,
          position: 0,
        },
      },
    },
    (context, input, tx) =>
      requireReceiptEvent(context, input.eventId, "events.edit", tx),
    async ({ services: s, principal: p }, { eventId, ...input }, tx) => {
      const workspace = await s.eventPackages.save(p.actor, eventId, input, tx);
      return {
        items: workspace.packages.map(({ published, ...item }) => ({
          ...item,
          published: Boolean(published),
        })),
      };
    },
  ),
  operation(
    {
      name: "events_prizes",
      effect: "read",
      path: "/events/{id}/prizes",
      method: "GET",
      scope: "events:read",
      description:
        "Read editorial prize drafts and versions. Does not expose entries, purchases or winners.",
      input: idInput,
      output: z.strictObject({ items: z.array(prizeItemOutput) }),
      example: { id: exampleId },
    },
    async ({ services: s, principal: p }, { id }) => ({
      items: (await s.eventPrizes.workspace(p.actor, id)).items.map(
        ({ published, ...item }) => ({
          ...item,
          published: Boolean(published),
        }),
      ),
    }),
  ),
  receiptOperation(
    {
      name: "events_prize_save",
      effect: "draft",
      path: "/events/{eventId}/prizes",
      method: "PATCH",
      scope: "events:prepare",
      description:
        "Save an editorial prize draft and owned image reference. Never issues entries, changes eligibility, runs a draw or publishes a prize.",
      input: prizeSaveSchema.extend({ eventId: z.uuid() }),
      output: prizeItemOutput,
      example: {
        eventId: exampleId,
        expectedVersion: 0,
        draft: {
          title: "Prize awaiting confirmation",
          description: "Replace with verified details.",
          imageId: null,
          alt: "",
          quantity: 1,
          position: 0,
          partnerId: null,
        },
      },
    },
    (context, input, tx) =>
      requireReceiptEvent(context, input.eventId, "events.edit", tx),
    async ({ services: s, principal: p }, { eventId, ...input }, tx) => {
      const workspace = await s.eventPrizes.save(p.actor, eventId, input, tx);
      const item = workspace.items.find(
        (item) => item.id === workspace.savedId,
      )!;
      return { ...item, published: Boolean(item.published) };
    },
  ),
];
