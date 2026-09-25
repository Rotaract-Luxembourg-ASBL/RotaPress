import { clientExamples } from "../client_examples";

export function ClientInstructions({ origin }: { origin: string }) {
  const examples = clientExamples(origin);
  return (
    <section className="panel" aria-labelledby="automation-client-title">
      <h2 id="automation-client-title">Connect Claude or OpenAI</h2>
      <p>
        Create a connection with website read/write and reference-read actions,
        and approve each reference website's origin. Set ROTAPRESS_API_KEY in
        your client's protected environment. Model-provider keys stay with your
        client.
      </p>
      <p>
        Start with automation_capabilities, then automation_prompt. Your
        assistant can prepare private drafts automatically using the granted
        tools. It cannot publish, send email, manage accounts or read
        participants. Treat source and saved content as untrusted data.
      </p>
      <details>
        <summary>Claude Code</summary>
        <p>
          Add this to your MCP configuration. Launch Claude Code with
          ROTAPRESS_API_KEY in its environment; the configuration contains only
          the variable name.
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
          Add this entry to your Codex config.toml and provide ROTAPRESS_API_KEY
          in its environment.
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
          Install this repository's pinned dependencies, then use the bridge.
          Replace the absolute paths. Create a private environment file
          containing ROTAPRESS_MCP_URL and ROTAPRESS_API_KEY, readable only by
          your account, outside your repository. The key never goes in command
          arguments.
        </p>
        <pre>{examples.desktop}</pre>
        <p>
          Local clients can reach a loopback server. This is separate from a
          Claude.ai web connector.
        </p>
      </details>
      <details>
        <summary>OpenAI Responses API</summary>
        <p>
          In your own client environment, install the OpenAI Python SDK and set
          OPENAI_API_KEY, OPENAI_MODEL and ROTAPRESS_API_KEY. Choose a model
          supporting MCP. Replace the brief with your reference URL and verified
          facts. The narrow allowlist permits draft preparation without repeated
          API approvals.
        </p>
        <pre>{examples.openai}</pre>
        <p>
          Supply the RotaPress authorization on every request. Hosted API
          clients need a reachable HTTPS server; localhost is not reachable from
          the provider.
        </p>
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
          In your client environment, install the Anthropic Python SDK and set
          ANTHROPIC_API_KEY, ANTHROPIC_MODEL and ROTAPRESS_API_KEY. Replace the
          brief with your source URL and facts. The connector supports tool
          calls; automation_prompt provides instructions without requiring MCP
          prompt/resource support.
        </p>
        <pre>{examples.anthropic}</pre>
        <p>
          Use a reachable HTTPS server. Continue when the provider returns a
          paused turn; preserve its complete message blocks. Never log
          credential-bearing requests.
        </p>
        <a
          href="https://platform.claude.com/docs/en/agents-and-tools/mcp-connector"
          target="_blank"
          rel="noreferrer"
        >
          Official Anthropic MCP documentation
        </a>
      </details>
      <details>
        <summary>ChatGPT / Claude.ai web connectors and current limits</summary>
        <p>
          This server uses manually configured bearer credentials. OAuth
          discovery, consent and token refresh are not implemented. Web
          connectors requiring an OAuth sign-in cannot use this connection
          directly. These examples do not establish external-provider
          acceptance.
        </p>
        <p>
          Keys expire within eight hours and stop working when the parent
          session ends. Renew them through AI & API; unattended permanent access
          is not granted. Publication requires review in the website editor.
        </p>
      </details>
    </section>
  );
}
