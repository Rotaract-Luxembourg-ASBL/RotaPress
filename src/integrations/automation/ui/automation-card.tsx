import { IntegrationCard } from "@/integrations/ui/integration-card";
export function AutomationCard() {
  return (
    <IntegrationCard
      name="AI & API"
      category="Content automation"
      icon="website"
      state="Private drafts"
      description="Use an AI assistant to adapt reference content into native website pages."
      connection="Scoped connections with an expiry and manual publication."
      settingsHref="/admin/integrations/automation"
      settingsLabel="Manage"
    >
      <span className="muted">REST · MCP · Guided prompts</span>
    </IntegrationCard>
  );
}
