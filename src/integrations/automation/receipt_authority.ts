import type {
  Capability,
  Transaction,
} from "@/core/authorization/AuthorizationService";
import type { EventCapability } from "@/features/events/event_schemas";
import type { AutomationContext } from "./operation";

export const requireReceiptCapability =
  (capability: Capability) =>
  (context: AutomationContext, _input: unknown, tx: Transaction) =>
    context.services.authorization.require(
      context.principal.actor,
      capability,
      tx,
    );

export async function requireReceiptEvent(
  context: AutomationContext,
  id: string,
  capability: EventCapability,
  tx: Transaction,
  recent = false,
) {
  if (recent)
    context.services.authorization.requireRecent(context.principal.actor);
  const event = await context.services.events.detail(
    context.principal.actor,
    id,
    tx,
  );
  context.services.events.requireCapability(event, capability);
}
