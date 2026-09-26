import { IntegrationPage } from "@/integrations/automation/ui/integration-page";
export const metadata = { title: "MCP · connections & setup guide" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <IntegrationPage transport="mcp" initialTab={(await searchParams).tab} />
  );
}
