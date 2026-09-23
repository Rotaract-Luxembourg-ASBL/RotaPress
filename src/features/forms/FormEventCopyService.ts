import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { form } from "../../../db/schema/forms";
import {
  DomainError,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import { formDefinitionSchema, type FormDefinition } from "./form_schemas";

export type EventFormCopy = {
  sourceId: string;
  revision: number;
  kind: "event" | "registration";
  archived: boolean;
  definition: FormDefinition;
};
/** Only editable definitions cross the boundary: no versions, answers or delivery destinations. */
export class FormEventCopyService {
  async snapshot(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ): Promise<EventFormCopy[]> {
    const rows = await tx
      .select({
        id: form.id,
        kind: form.kind,
        archived: form.archived,
        draft: form.draft,
        revision: form.draftRevision,
      })
      .from(form)
      .where(
        and(eq(form.organizationId, organizationId), eq(form.eventId, eventId)),
      )
      .orderBy(asc(form.id))
      .limit(201);
    if (rows.length > 200)
      throw new DomainError(
        "EVENT_COPY_TOO_LARGE",
        "Copy at most 200 forms in one event.",
        422,
      );
    return rows.map((row) => ({
      sourceId: row.id,
      revision: row.revision,
      kind: z.enum(["event", "registration"]).parse(row.kind),
      archived: row.archived,
      definition: formDefinitionSchema.parse(row.draft),
    }));
  }
  async createDrafts(
    organizationId: string,
    eventId: string,
    definitions: EventFormCopy[],
    tx: Transaction,
  ) {
    const ids = new Map<string, string>();
    for (const definition of definitions) {
      const [row] = await tx
        .insert(form)
        .values({
          organizationId,
          eventId,
          kind: definition.kind,
          archived: definition.archived,
          draft: formDefinitionSchema.parse(definition.definition),
        })
        .returning({ id: form.id });
      ids.set(definition.sourceId, row.id);
    }
    return ids;
  }
}
