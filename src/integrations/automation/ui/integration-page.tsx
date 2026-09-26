import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { config } from "@/core/config";
import { operationCatalogue, contractVersion } from "../catalogue";
import type { AutomationTransport } from "../availability_schemas";
import { AutomationWorkspace } from "./automation-workspace";
import "./workspace.css";
import "@/app/admin/integrations/automation/docs/docs.css";

export async function IntegrationPage({
  transport,
  initialTab,
}: {
  transport: AutomationTransport;
  initialTab?: string;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect(`/sign-in?next=/admin/integrations/${transport}`);
  const access = await services.authorization.optional(actor);
  if (!access?.capabilities.includes("integrations.manage"))
    return (
      <section className="panel">
        <h1>{transport === "rest" ? "REST API" : "MCP"}</h1>
        <p>An approved owner or administrator can manage this integration.</p>
      </section>
    );
  return (
    <AutomationWorkspace
      transport={transport}
      initialTab={initialTab}
      operations={operationCatalogue()}
      version={contractVersion}
      origin={new URL(config.APP_URL).origin}
    />
  );
}
