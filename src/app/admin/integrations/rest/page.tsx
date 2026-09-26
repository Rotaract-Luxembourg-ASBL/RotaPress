import { IntegrationPage } from "@/integrations/automation/ui/integration-page";
export const metadata = { title: "REST API · tokens, documentation & tester" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <IntegrationPage transport="rest" initialTab={(await searchParams).tab} />
  );
}
