"use client";
import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { StatusBadge } from "@/ui/collection";
import type { operationCatalogue } from "../catalogue";
import type {
  AutomationAvailabilityState,
  AutomationTransport,
} from "../availability_schemas";
import { OAuthSettings } from "../oauth/oauth-settings";
import { TokenSettings } from "./token-settings";
import { AutomationDocs } from "./automation-docs";
import { ClientInstructions } from "./client-instructions";

export function AutomationWorkspace({
  transport,
  initialTab,
  operations,
  version,
  origin,
}: {
  transport: AutomationTransport;
  initialTab?: string;
  operations: ReturnType<typeof operationCatalogue>;
  version: string;
  origin: string;
}) {
  const rest = transport === "rest";
  const [tab, setTab] = useState(
    initialTab === "docs" || (!rest && initialTab === "guide")
      ? initialTab
      : "connections",
  );
  const [method, setMethod] = useState<"oauth" | "key">("oauth");
  const [credential, setCredential] = useState("");
  const [copied, setCopied] = useState("");
  const { data, error, refresh } = useResource<{
    items: AutomationAvailabilityState[];
  }>("/api/admin/integrations/automation/availability");
  const state = data?.items.find((item) => item.kind === transport);
  const tabs = [
    { id: "connections", label: rest ? "API tokens" : "Connections" },
    ...(!rest ? [{ id: "guide", label: "Setup guide" }] : []),
    {
      id: "docs",
      label: rest ? "Documentation & tester" : "Tools & connection test",
    },
  ];
  const endpoint = `${origin}${rest ? "/api/v1" : "/api/mcp"}`;
  function activate(id: string) {
    setTab(id);
    window.history.replaceState(
      null,
      "",
      `/admin/integrations/${transport}?tab=${id}`,
    );
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    activate(tabs[next].id);
    document.getElementById(`integration-tab-${tabs[next].id}`)?.focus();
  }
  return (
    <div className="automation-workspace">
      <Link href="/admin/integrations">← Integrations</Link>
      <PageHeading
        title={rest ? "REST API" : "MCP"}
        description={
          rest
            ? "Create API tokens, explore endpoints and send real requests from this workspace."
            : "Connect your AI assistant, choose its permissions and learn how to use your tools."
        }
      >
        {state && (
          <StatusBadge tone={state.enabled ? "success" : "neutral"}>
            {state.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
        )}
      </PageHeading>
      <div className="panel integration-endpoint">
        <div>
          <strong>{rest ? "API base URL" : "MCP server URL"}</strong>
          <code>{endpoint}</code>
        </div>
        <button
          className="button button-outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(endpoint);
              setCopied("URL copied.");
            } catch {
              setCopied("Select the URL and copy it manually.");
            }
          }}
        >
          Copy URL
        </button>
        {copied && (
          <span role="status" className="small">
            {copied}
          </span>
        )}
      </div>
      {error ? (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Reload status
          </button>
        </Notice>
      ) : !state ? (
        <Loading />
      ) : (
        !state.enabled && (
          <Notice kind="info">
            {rest ? "REST API" : "MCP"} is disabled. You can prepare credentials
            and read documentation.{" "}
            <Link href="/admin/integrations">
              Enable {rest ? "REST API" : "MCP"} in Integrations
            </Link>{" "}
            before connecting or sending requests.
          </Notice>
        )
      )}
      <div
        role="tablist"
        aria-label={`${rest ? "REST API" : "MCP"} sections`}
        className="integration-tabs"
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`integration-tab-${item.id}`}
            aria-controls={`integration-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onKeyDown={(event) => keyboard(event, index)}
            onClick={() => activate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="integration-panel-connections"
        aria-labelledby="integration-tab-connections"
        hidden={tab !== "connections"}
      >
        {!rest && (
          <fieldset className="mcp-methods">
            <legend>How will your assistant connect?</legend>
            <label>
              <input
                type="radio"
                name="mcp-method"
                value="oauth"
                checked={method === "oauth"}
                onChange={() => setMethod("oauth")}
              />
              <span>
                <strong>OAuth · recommended</strong>
                <span>Sign in and approve access in RotaPress.</span>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="mcp-method"
                value="key"
                checked={method === "key"}
                onChange={() => setMethod("key")}
              />
              <span>
                <strong>MCP access key</strong>
                <span>
                  For bearer-authenticated clients and the local bridge.
                </span>
              </span>
            </label>
          </fieldset>
        )}
        {!rest && (
          <div hidden={method !== "oauth"}>
            <OAuthSettings />
          </div>
        )}
        <div hidden={!rest && method !== "key"}>
          <TokenSettings
            transport={transport}
            onTest={(key) => {
              setCredential(key);
              activate("docs");
            }}
          />
        </div>
      </div>
      {!rest && (
        <div
          role="tabpanel"
          id="integration-panel-guide"
          aria-labelledby="integration-tab-guide"
          hidden={tab !== "guide"}
        >
          <ClientInstructions origin={origin} />
        </div>
      )}
      <div
        role="tabpanel"
        id="integration-panel-docs"
        aria-labelledby="integration-tab-docs"
        hidden={tab !== "docs"}
      >
        <AutomationDocs
          operations={operations}
          version={version}
          origin={origin}
          transport={transport}
          credential={credential}
          onCredentialChange={setCredential}
          enabled={state?.enabled === true}
          onConnect={() => activate("connections")}
        />
      </div>
    </div>
  );
}
