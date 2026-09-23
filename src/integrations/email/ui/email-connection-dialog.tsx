"use client";
import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import {
  connectionSaveSchema,
  type EmailConnectionView,
  type ConnectionInput,
} from "../email_schemas";

export function EmailConnectionDialog({
  current,
  busy,
  error,
  close,
  save,
}: {
  current?: EmailConnectionView;
  busy: boolean;
  error?: string;
  close: () => void;
  save: (input: ConnectionInput) => Promise<boolean>;
}) {
  const [value, setValue] = useState<ConnectionInput>({
    id: current?.id,
    expectedVersion: current?.version ?? 0,
    name: current?.name ?? "",
    provider: current?.provider ?? "resend",
    senderName: current?.senderName ?? "",
    senderEmail: current?.senderEmail ?? "",
    replyTo: current?.replyTo ?? "",
    smtp: current?.smtp ?? null,
  });
  const [secret, setSecret] = useState("");
  const [problem, setProblem] = useState<string>();
  const change = <K extends keyof ConnectionInput>(
    key: K,
    next: ConnectionInput[K],
  ) => setValue((v) => ({ ...v, [key]: next }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = connectionSaveSchema.safeParse({
      ...value,
      ...(secret ? { secret } : {}),
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setProblem(undefined);
    if (await save(parsed.data)) close();
  }
  return (
    <Dialog
      title={current ? "Edit email connection" : "Add email connection"}
      onClose={close}
      canClose={() => !busy}
    >
      <form
        className="email-connection-form"
        onSubmit={(event) => void submit(event)}
      >
        <p>
          Save a connection, send a test to your own account, then choose it as
          your sender.
        </p>
        <fieldset disabled={busy}>
          <label>
            Connection name
            <input
              required
              maxLength={80}
              value={value.name}
              placeholder="Community email"
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            Delivery provider
            <select
              value={value.provider}
              onChange={(e) => {
                const provider = e.target.value as "smtp" | "resend";
                setValue({
                  ...value,
                  provider,
                  smtp:
                    provider === "smtp"
                      ? { host: "", port: 587, username: "" }
                      : null,
                });
                setSecret("");
              }}
            >
              <option value="resend">Resend</option>
              <option value="smtp">SMTP provider</option>
            </select>
          </label>
          <div className="email-field-pair">
            <label>
              Sender name
              <input
                required
                maxLength={100}
                value={value.senderName}
                onChange={(e) => change("senderName", e.target.value)}
              />
            </label>
            <label>
              Sender email
              <input
                type="email"
                required
                maxLength={254}
                placeholder="hello@yourclub.org"
                value={value.senderEmail}
                onChange={(e) => change("senderEmail", e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            Use a sender address verified with your email provider.
          </p>
          {value.smtp && (
            <>
              <label>
                SMTP hostname
                <input
                  required
                  value={value.smtp.host}
                  placeholder="smtp.your-provider.com"
                  onChange={(e) =>
                    change("smtp", { ...value.smtp!, host: e.target.value })
                  }
                />
              </label>
              <label>
                Secure connection
                <select
                  value={value.smtp.port}
                  onChange={(e) =>
                    change("smtp", {
                      ...value.smtp!,
                      port: Number(e.target.value) as 465 | 587,
                    })
                  }
                >
                  <option value={587}>Port 587 · STARTTLS required</option>
                  <option value={465}>Port 465 · TLS</option>
                </select>
              </label>
              <label>
                SMTP username
                <input
                  required
                  autoComplete="off"
                  value={value.smtp.username}
                  onChange={(e) =>
                    change("smtp", { ...value.smtp!, username: e.target.value })
                  }
                />
              </label>
            </>
          )}
          <label>
            {value.provider === "resend" ? "Resend API key" : "SMTP password"}
            <input
              type="password"
              autoComplete="new-password"
              maxLength={200}
              required={!current}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <p className="muted">
            {current
              ? "Leave empty to keep the saved credential for the same account. "
              : ""}
            Credentials are encrypted and never shown again.
          </p>
          <details>
            <summary>Reply address (optional)</summary>
            <label>
              Reply-to email
              <input
                type="email"
                value={value.replyTo}
                onChange={(e) => change("replyTo", e.target.value)}
              />
            </label>
          </details>
        </fieldset>
        {(problem || error) && <Notice>{problem ?? error}</Notice>}
        <div className="email-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button button-accent" disabled={busy}>
            {busy ? "Saving…" : "Save connection"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
