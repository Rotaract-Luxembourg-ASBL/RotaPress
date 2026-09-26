import { clientExamples } from "../client_examples";

export function ClientInstructions({ origin }: { origin: string }) {
  const examples = clientExamples(origin);
  return (
    <div className="automation-docs automation-guide">
      <section className="panel" aria-labelledby="mcp-setup-title">
        <h2 id="mcp-setup-title">MCP setup guide</h2>
        <p>
          Server URL: <code>{origin}/api/mcp</code>. Choose the connection
          method supported by your assistant. RotaPress supplies tools; the
          assistant supplies its own model.
        </p>
        <h3>Connect with OAuth</h3>
        <ol>
          <li>
            Open the assistant's MCP, apps or connectors settings. Add the
            server URL above and select OAuth.
          </li>
          <li>
            Find the client's exact callback URL. In{" "}
            <strong>Connections → OAuth</strong>, enter that URL, choose allowed
            actions and select <strong>Create OAuth connection</strong>.
          </li>
          <li>
            Copy the client ID and one-time secret into the assistant's
            protected settings. Select a public client only if your assistant
            supports PKCE without a secret.
          </li>
          <li>
            Finish connecting in the assistant. Sign in to RotaPress with the
            account that registered the client and approve the requested
            actions.
          </li>
          <li>
            Ask the assistant to call <code>automation_capabilities</code>. Then
            prepare one private draft and review it in RotaPress.
          </li>
        </ol>
        <p className="small muted">
          Use a client that accepts a pre-registered client ID. Anonymous
          dynamic registration is unavailable. Hosted clients need to reach your
          HTTPS installation; a remote provider cannot reach your computer's
          localhost.
        </p>
        <h3>Connect with an MCP access key</h3>
        <ol>
          <li>
            In <strong>Connections → MCP access key</strong>, name the client,
            choose permissions and generate its key.
          </li>
          <li>
            Save it in the client's protected bearer credential field. A
            custom-header client sends{" "}
            <code>Authorization: Bearer &lt;MCP access key&gt;</code>.
          </li>
          <li>
            Use <strong>Use in connection test</strong> to initialize MCP and
            discover tools here, then verify a tool call in your actual client.
          </li>
        </ol>
        <p>
          Keys expire within eight hours and stop when their parent staff
          session ends. OAuth access tokens last five minutes, with optional
          rotating renewal for up to eight hours after consent while that
          session remains active. Reconnect when access expires; revoke unwanted
          connections from this workspace.
        </p>
      </section>
      <section className="panel" aria-labelledby="mcp-examples-title">
        <h2 id="mcp-examples-title">Client configuration examples</h2>
        <p>
          These examples use an MCP access key stored as{" "}
          <code>ROTAPRESS_MCP_KEY</code> in your client's protected environment.
          They contain variable names, never your credentials.
        </p>
        <details>
          <summary>Claude Code</summary>
          <p>
            Add this to your MCP configuration and start the client with
            ROTAPRESS_MCP_KEY in its environment.
          </p>
          <pre>{examples.claudeCode}</pre>
          <a
            href="https://code.claude.com/docs/en/mcp"
            target="_blank"
            rel="noreferrer"
          >
            Official Claude Code MCP instructions
          </a>
        </details>
        <details>
          <summary>OpenAI Codex</summary>
          <p>
            Add this to config.toml and provide ROTAPRESS_MCP_KEY in the
            client's environment.
          </p>
          <pre>{examples.codex}</pre>
          <a
            href="https://developers.openai.com/codex/mcp/"
            target="_blank"
            rel="noreferrer"
          >
            Official Codex MCP instructions
          </a>
        </details>
        <details>
          <summary>Claude Desktop / local stdio</summary>
          <p>
            Install this repository's pinned dependencies, then use its bridge.
            Replace the absolute paths. Create a private environment file
            outside the repository containing ROTAPRESS_MCP_URL and
            ROTAPRESS_MCP_KEY, readable only by your account. The key stays out
            of command arguments.
          </p>
          <pre>{examples.desktop}</pre>
        </details>
        <details>
          <summary>OpenAI Responses API</summary>
          <p>
            Install the OpenAI Python SDK in your client environment. Set
            OPENAI_API_KEY, OPENAI_MODEL and ROTAPRESS_MCP_KEY there. Choose a
            model supporting MCP and supply the authorization on every request.
            The allowlist permits private content preparation.
          </p>
          <pre>{examples.openai}</pre>
          <a
            href="https://developers.openai.com/api/docs/guides/tools-connectors-mcp"
            target="_blank"
            rel="noreferrer"
          >
            Official OpenAI MCP documentation
          </a>
        </details>
        <details>
          <summary>Anthropic Messages API</summary>
          <p>
            Install the Anthropic Python SDK in your client environment. Set
            ANTHROPIC_API_KEY, ANTHROPIC_MODEL and ROTAPRESS_MCP_KEY. Preserve
            complete message blocks when continuing a paused turn.
          </p>
          <pre>{examples.anthropic}</pre>
          <a
            href="https://platform.claude.com/docs/en/agents-and-tools/mcp-connector"
            target="_blank"
            rel="noreferrer"
          >
            Official Anthropic MCP documentation
          </a>
        </details>
      </section>
      <section className="panel">
        <h2>What to ask your assistant</h2>
        <p>
          Start with capabilities to discover granted operations. For website
          work, choose website reading and drafting. Add reference reading and
          exact HTTPS origins when adapting another website.
        </p>
        <ul>
          <li>
            <code>plan_native_website</code>: plan pages with the club's native
            blocks and theme.
          </li>
          <li>
            <code>adapt_reference_website</code>: prepare drafts from a
            permitted reference URL and verified club facts.
          </li>
          <li>
            <code>prepare_event</code>: prepare an event with private pages,
            forms and settings suggestions.
          </li>
          <li>
            <code>review_page_design</code>: inspect saved desktop and phone
            previews when the connection has preview permissions.
          </li>
        </ul>
        <p>
          Clients without prompts can use the workflow tools in{" "}
          <strong>Tools & connection test</strong>. Review returned draft links
          and sources before publishing. Event suggestions require staff
          approval.
        </p>
        <details>
          <summary>Connection troubleshooting</summary>
          <ul>
            <li>Enable MCP in Integrations. Disabled servers return 409.</li>
            <li>
              For OAuth, copy the exact callback, keep the resource set to the
              server URL, and sign in again if recent authentication is
              required.
            </li>
            <li>
              For 401, check credential type, expiry and the parent staff
              session. For 403, check the requested permissions and approved
              reference origins.
            </li>
            <li>
              Use a reachable HTTPS URL for hosted clients. Local stdio clients
              may use loopback.
            </li>
            <li>
              Existing keys from the former shared screen need replacing with an
              MCP access key or OAuth connection.
            </li>
          </ul>
        </details>
        <details>
          <summary>OAuth discovery and protocol</summary>
          <p>
            Transport: stateless Streamable HTTP, POST /api/mcp. OAuth uses
            authorization code with S256 PKCE, an exact registered callback and
            the resource <code>{origin}/api/mcp</code>.
          </p>
          <dl>
            <dt>Protected resource metadata</dt>
            <dd>
              <code>{origin}/.well-known/oauth-protected-resource/api/mcp</code>
            </dd>
            <dt>Authorization server metadata</dt>
            <dd>
              <code>
                {origin}/.well-known/oauth-authorization-server/api/auth
              </code>
            </dd>
            <dt>Authorization endpoint</dt>
            <dd>
              <code>{origin}/api/auth/oauth2/authorize</code>
            </dd>
            <dt>Token endpoint</dt>
            <dd>
              <code>{origin}/api/auth/oauth2/token</code>
            </dd>
          </dl>
        </details>
      </section>
    </div>
  );
}
