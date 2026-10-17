import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RenewalContext } from "./oauth-renewal-cases";
import { removeOAuthConnection } from "./oauth-test-cleanup";
import type { AutomationScope } from "../../src/integrations/automation/scopes";

type CredentialKind = "rest" | "mcp" | "oauth";
type Credential = {
  token: string;
  transport: "rest" | "mcp";
  revoke: () => Promise<void>;
  cleanup: () => Promise<void>;
};

/** Actual OTP-backed credentials exercise the download route, not a forged context. */
export function oauthExportDownloadChecks(get: () => RenewalContext) {
  async function issue(
    kind: CredentialKind,
    scopes: AutomationScope[],
  ): Promise<Credential> {
    const c = get();
    const { automationAccess } =
      await import("../../src/composition/automation");
    if (kind !== "oauth") {
      const key = await automationAccess.create(c.actor, {
        transport: kind,
        name: `Synthetic ${kind} export`,
        scopes,
        sourceOrigins: [],
      });
      let revoked = false;
      const revoke = async () => {
        if (revoked) return;
        await automationAccess.revoke(c.actor, c.headers, key.id);
        revoked = true;
      };
      return { token: key.key, transport: kind, revoke, cleanup: revoke };
    }
    const callback = `${c.origin}/synthetic-export-callback`;
    const client = await c.connections.create(c.actor, c.headers, {
      name: "Synthetic OAuth export",
      redirectUris: [callback],
      scopes,
      sourceOrigins: [],
    });
    const cleanup = async () => {
      await removeOAuthConnection(
        c.connections,
        c.actor,
        c.headers,
        client.clientId,
      );
    };
    try {
      const flow = await c.authorize(
        client.clientId,
        callback,
        [...scopes, "offline_access"].join(" "),
      );
      const response = await c.exchange({
        grant_type: "authorization_code",
        client_id: client.clientId,
        client_secret: client.clientSecret!,
        redirect_uri: callback,
        resource: c.resource,
        code: flow.code,
        code_verifier: flow.verifier,
      });
      expect(response.status).toBe(200);
      const token = (await response.json()) as { access_token: string };
      return {
        token: token.access_token,
        transport: "mcp",
        revoke: async () => {
          const current = (await c.connections.list(c.actor)).clients.find(
            (entry) => entry.clientId === client.clientId,
          )!;
          await c.connections.revoke(
            c.actor,
            c.headers,
            client.clientId,
            current.permissionsRevision,
          );
        },
        cleanup,
      };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  describe("C14 real-credential private export downloads", () => {
    it.each(["rest", "mcp", "oauth"] as const)(
      "accepts the originating %s credential and preserves transport, grant and revocation boundaries",
      async (kind) => {
        const c = get();
        const { services } = await import("../../src/composition/services");
        const { automationContext, automationAvailability } =
          await import("../../src/composition/automation");
        const { executeOperation } =
          await import("../../src/integrations/automation/catalogue");
        const { exportInfo } =
          await import("../../src/integrations/automation/export_delivery");
        const download =
          await import("../../src/app/api/v1/response-exports/[id]/download/route");
        const rest = await import("../../src/app/api/v1/[...path]/route");
        const before = (await automationAvailability.list(c.actor)).find(
          (entry) => entry.kind === "rest",
        )!;
        if (!before.enabled)
          await automationAvailability.change(c.actor, {
            kind: "rest",
            enabled: true,
            expectedVersion: before.version,
            confirmed: true,
          });
        const credentials: Credential[] = [];
        try {
          const source = await issue(kind, ["responses:export"]);
          credentials.push(source);
          const other = await issue(kind, ["responses:export"]);
          credentials.push(other);
          const ungranted = await issue(kind, ["website:read"]);
          credentials.push(ungranted);

          const form = await services.forms.create(c.actor, {
            kind: "contact",
            title: `Synthetic ${kind} export`,
          });
          await services.forms.publish(c.actor, form.id, {
            expectedRevision: form.draftRevision,
          });
          const published = await services.forms.publicForm(form.id);
          const marker = `Private ${kind} export ${randomUUID()}`;
          await services.submissions.submit(null, form.id, {
            versionId: published.versionId,
            requestId: randomUUID(),
            answers: {
              name: "Synthetic visitor",
              email: "synthetic-export@example.test",
              message: marker,
            },
          });
          const request = (token: string, url: string, method = "GET") =>
            new Request(new URL(url, c.origin), {
              method,
              headers: { authorization: `Bearer ${token}` },
            });
          const context = await automationContext(
            request(source.token, c.resource),
            source.transport,
          );
          const exported = exportInfo.parse(
            await executeOperation(context, "responses_export", {
              formId: form.id,
              requestId: randomUUID(),
            }),
          );
          const routeContext = { params: Promise.resolve({ id: exported.id }) };
          const body = await download.GET(
            request(source.token, exported.downloadUrl),
            routeContext,
          );
          expect(body.status).toBe(200);
          expect(body.headers.get("cache-control")).toBe("private, no-store");
          expect(body.headers.get("content-type")).toBe(
            "text/csv;charset=utf-8",
          );
          expect(body.headers.get("vary")).toBe("Authorization");
          const bytes = Buffer.from(await body.arrayBuffer());
          expect(bytes.toString("utf8")).toContain(marker);
          expect(bytes.length).toBe(exported.byteLength);
          expect(createHash("sha256").update(bytes).digest("hex")).toBe(
            exported.sha256,
          );
          const head = await download.HEAD(
            request(source.token, exported.downloadUrl, "HEAD"),
            routeContext,
          );
          expect(head.status).toBe(200);
          expect(head.headers.get("content-length")).toBe(String(bytes.length));
          expect(await head.text()).toBe("");

          const deniedConnection = await download.GET(
            request(other.token, exported.downloadUrl),
            routeContext,
          );
          expect(deniedConnection.status).toBe(410);
          expect(await deniedConnection.text()).not.toContain(marker);
          const deniedGrant = await download.GET(
            request(ungranted.token, exported.downloadUrl),
            routeContext,
          );
          expect(deniedGrant.status).toBe(403);
          expect(await deniedGrant.text()).not.toContain(marker);
          const cookieOnly = await download.GET(
            new Request(new URL(exported.downloadUrl, c.origin), {
              headers: c.headers,
            }),
            routeContext,
          );
          expect(cookieOnly.status).toBe(401);

          // The download exception must not admit MCP credentials to general REST.
          const general = await rest.GET(
            request(source.token, "/api/v1/openapi.json"),
            { params: Promise.resolve({ path: ["openapi.json"] }) },
          );
          expect(general.status).toBe(source.transport === "rest" ? 200 : 401);

          await source.revoke();
          const revoked = await download.GET(
            request(source.token, exported.downloadUrl),
            routeContext,
          );
          expect(revoked.status).toBe(401);
          expect(await revoked.text()).not.toContain(marker);
          expect(
            (
              await download.HEAD(
                request(source.token, exported.downloadUrl, "HEAD"),
                routeContext,
              )
            ).status,
          ).toBe(401);
        } finally {
          for (const credential of credentials.reverse())
            await credential.cleanup();
          if (!before.enabled) {
            const current = (await automationAvailability.list(c.actor)).find(
              (entry) => entry.kind === "rest",
            )!;
            await automationAvailability.change(c.actor, {
              kind: "rest",
              enabled: false,
              expectedVersion: current.version,
              confirmed: true,
            });
          }
        }
      },
    );
  });
}
