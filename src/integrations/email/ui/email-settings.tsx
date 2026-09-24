"use client";
import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import { PageHeading, Notice, Loading } from "@/ui/primitives";
import { request, useResource, errorMessage } from "@/ui/api";
import { ActionsMenu } from "@/ui/actions-menu";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { EmailConnectionDialog } from "./email-connection-dialog";
import { EmailTemplateEditor } from "./email-template-editor";
import {
  EmailServerConnection,
  emailProviderLabel,
} from "./email-server-connection";
import { emailTemplateCatalogue } from "../email_templates";
import type {
  EmailConnectionView,
  EmailTemplateKey,
  EmailWorkspace,
} from "../email_schemas";

const endpoint = "/api/admin/integrations/email";
function closeConnectionMenu(event: MouseEvent<HTMLButtonElement>) {
  const menu = event.currentTarget.closest("details");
  menu?.removeAttribute("open");
  menu?.querySelector("summary")?.focus();
}
export function EmailSettings() {
  const resource = useResource<EmailWorkspace>(endpoint);
  const [saved, setSaved] = useState<EmailWorkspace>();
  const [tab, setTab] = useState("connections");
  const [template, setTemplate] = useState<EmailTemplateKey>("calendar_update");
  const [dirty, setDirty] = useState(false);
  const [connection, setConnection] = useState<EmailConnectionView | "new">();
  const [deletion, setDeletion] = useState<EmailConnectionView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const inFlight = useRef(false);
  const data = saved ?? resource.data;
  async function act(operation: string, values: unknown) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setReceipt(undefined);
    try {
      setSaved(
        await request<EmailWorkspace>(endpoint, {
          method: "POST",
          body: JSON.stringify({ operation, values }),
        }),
      );
      setReceipt(
        operation === "testConnection"
          ? "Test submitted to the sender for your signed-in email address. Check your inbox to confirm delivery."
          : operation === "publishTemplate"
            ? "Template published. Future emails use this design."
            : operation === "saveTemplate"
              ? "Draft saved. Sending still uses the published template."
              : operation === "useConnection"
                ? "Sending connection updated."
                : operation === "deleteConnection"
                  ? "Connection deleted."
                  : "Connection saved. Send a test before choosing it as your sender.",
      );
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return resource.error ? (
      <>
        <Notice>{resource.error}</Notice>
        <button className="button button-outline" onClick={resource.refresh}>
          Try again
        </button>
      </>
    ) : (
      <Loading />
    );
  const actionValues = (c?: EmailConnectionView) => ({
    id: c?.id ?? null,
    expectedVersion: c?.version ?? 0,
  });
  const selected = data.connections.find((c) => c.isDefault);
  const row = data.templates.find((t) => t.key === template)!;
  return (
    <div className="email-workspace">
      <Link href="/admin/integrations">← Integrations</Link>
      <PageHeading
        title="Email"
        description="Choose how emails are delivered and make them feel like your community."
      />
      <div className="email-sending-summary">
        <Icon name="mail" />
        <div>
          <strong>
            {(selected && !data.remoteEnabled) ||
            (!selected && data.server.provider && !data.server.ready)
              ? "Email sending is disabled"
              : selected
                ? `Sending with ${selected.name}`
                : !data.server.ready
                  ? "Email delivery is unavailable"
                  : data.server.provider === "development"
                    ? "Development email capture"
                    : "Sending with the server sender"}
          </strong>
          <p>
            {selected
              ? `${selected.senderName} · ${selected.senderEmail}`
              : data.server.provider === "development"
                ? "Development only. Messages do not reach a real inbox."
                : data.server.provider
                  ? `${emailProviderLabel(data.server.provider)} · ${data.server.senderName} · ${data.server.senderEmail}`
                  : "Ask the server administrator to configure a sender, or add a connection below."}
          </p>
        </div>
      </div>
      <div className="email-tabs" role="tablist" aria-label="Email settings">
        <button
          role="tab"
          id="email-connections-tab"
          aria-controls="email-connections"
          aria-selected={tab === "connections"}
          onClick={() => setTab("connections")}
        >
          Connections
        </button>
        <button
          role="tab"
          id="email-templates-tab"
          aria-controls="email-templates"
          aria-selected={tab === "templates"}
          onClick={() => setTab("templates")}
        >
          Templates
        </button>
      </div>
      {error && !connection && <Notice>{error}</Notice>}
      {receipt && <Notice kind="success">{receipt}</Notice>}
      <section
        id="email-connections"
        role="tabpanel"
        aria-labelledby="email-connections-tab"
        hidden={tab !== "connections"}
      >
        <div className="email-section-heading">
          <div>
            <h2>Delivery connections</h2>
            <p>
              Keep several connections and choose one sender for sign-in codes,
              form alerts and calendar emails.
            </p>
          </div>
          {data.canManageConnections && (
            <button
              className="button button-accent"
              disabled={busy || !data.encryptionReady}
              onClick={() => {
                setError(undefined);
                setConnection("new");
              }}
            >
              <Icon name="plus" />
              Add connection
            </button>
          )}
        </div>
        {!data.encryptionReady && (
          <Notice kind="info">
            Your server administrator needs to configure credential encryption
            before you can save a connection.
          </Notice>
        )}
        {!data.remoteEnabled && (
          <p className="email-local-note">
            Resend and SMTP connections can be saved now. Sending through an
            external provider is disabled on this server.
          </p>
        )}
        {!data.canManageConnections && (
          <Notice kind="info">
            Only the club owner can change delivery connections, because they
            also deliver sign-in codes. You can edit email templates.
          </Notice>
        )}
        <div className="email-connection-list">
          <EmailServerConnection
            server={data.server}
            canManage={data.canManageConnections}
            busy={busy}
            onTest={() => void act("testConnection", actionValues())}
            onUse={() => void act("useConnection", actionValues())}
          />
          {data.connections.map((c) => (
            <article
              className="panel email-connection-row"
              key={c.id}
              aria-label={c.name}
            >
              <div className="email-provider-mark">
                {c.provider === "resend" ? "R" : <Icon name="mail" />}
              </div>
              <div className="email-connection-copy">
                <h3>{c.name}</h3>
                <p>
                  {c.provider === "resend" ? "Resend" : "SMTP"} ·{" "}
                  {c.senderEmail}
                </p>
                <span className="status-badge">
                  {c.isDefault
                    ? "Current sender"
                    : c.verifiedAt
                      ? "Test sent"
                      : "Not tested"}
                </span>
              </div>
              {data.canManageConnections && (
                <div className="email-actions">
                  <button
                    className="button button-outline"
                    disabled={busy || !data.remoteEnabled}
                    onClick={() => void act("testConnection", actionValues(c))}
                  >
                    Send test
                  </button>
                  {!c.isDefault && (
                    <button
                      className="button button-outline"
                      disabled={busy || !c.verifiedAt || !data.remoteEnabled}
                      onClick={() => void act("useConnection", actionValues(c))}
                    >
                      Use as sender
                    </button>
                  )}
                  <ActionsMenu
                    label={`Connection actions for ${c.name}`}
                    disabled={busy}
                  >
                    <button
                      disabled={c.isDefault}
                      onClick={(event) => {
                        closeConnectionMenu(event);
                        setError(undefined);
                        setConnection(c);
                      }}
                    >
                      Edit connection
                    </button>
                    <button
                      disabled={c.isDefault}
                      onClick={(event) => {
                        closeConnectionMenu(event);
                        setDeletion(c);
                      }}
                    >
                      Delete connection
                    </button>
                  </ActionsMenu>
                </div>
              )}
              {c.isDefault && (
                <p className="muted email-connection-help">
                  Choose another sender before editing credentials or deleting
                  this connection.
                </p>
              )}
            </article>
          ))}
        </div>
        <p className="muted">
          Each test sends only to your own verified account. A provider
          accepting a test does not prove inbox delivery; check your mailbox.
          Failed sends remain in their existing notification queues.
        </p>
      </section>
      <section
        id="email-templates"
        role="tabpanel"
        aria-labelledby="email-templates-tab"
        hidden={tab !== "templates"}
      >
        <label className="email-template-picker">
          Email to customize
          <select
            value={template}
            disabled={busy}
            onChange={(e) => {
              if (
                !dirty ||
                window.confirm(
                  "Discard the unsaved changes to this email template?",
                )
              )
                setTemplate(e.target.value as EmailTemplateKey);
            }}
          >
            {data.templates.map((t) => (
              <option key={t.key} value={t.key}>
                {emailTemplateCatalogue[t.key].name}
              </option>
            ))}
          </select>
        </label>
        <EmailTemplateEditor
          key={`${row.key}:${row.version}`}
          row={row}
          clubName={data.clubName}
          busy={busy}
          act={act}
          dirtyChanged={setDirty}
        />
      </section>
      {connection && (
        <EmailConnectionDialog
          current={connection === "new" ? undefined : connection}
          busy={busy}
          error={error}
          close={() => setConnection(undefined)}
          save={(values) => act("saveConnection", values)}
        />
      )}
      {deletion && (
        <Dialog
          title="Delete email connection?"
          onClose={() => setDeletion(undefined)}
          canClose={() => !busy}
        >
          <p>
            Delete {deletion.name} and its saved credential. Templates and past
            notifications are kept. You will need to enter the credential again
            to reconnect.
          </p>
          <div className="email-actions">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setDeletion(undefined)}
            >
              Cancel
            </button>
            <button
              className="button button-accent"
              disabled={busy}
              onClick={async () => {
                if (await act("deleteConnection", actionValues(deletion)))
                  setDeletion(undefined);
              }}
            >
              Delete connection
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
