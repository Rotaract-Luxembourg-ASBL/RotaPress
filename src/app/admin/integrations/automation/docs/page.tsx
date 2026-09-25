import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { config } from "@/core/config";
import {
  operationCatalogue,
  contractVersion,
} from "@/integrations/automation/catalogue";
import { AutomationDocs } from "@/integrations/automation/ui/automation-docs";
import "./docs.css";

export const metadata = { title: "API documentation & tester" };
export default async function Page() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/sign-in?next=/admin/integrations/automation/docs");
  const access = await services.authorization.optional(actor);
  if (!access?.capabilities.includes("integrations.manage"))
    return (
      <section className="panel">
        <h1>API documentation & tester</h1>
        <p>
          An approved owner or administrator can manage and test connections.
        </p>
      </section>
    );
  return (
    <AutomationDocs
      operations={operationCatalogue()}
      version={contractVersion}
      origin={new URL(config.APP_URL).origin}
    />
  );
}
