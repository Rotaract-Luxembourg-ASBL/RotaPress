export const contentTools = [
  "automation_capabilities",
  "automation_prompt",
  "website_context",
  "website_list",
  "website_get",
  "source_read",
  "content_import",
  "import_get",
  "website_save",
];
export function clientExamples(origin: string) {
  const endpoint = `${new URL(origin).origin}/api/mcp`;
  return {
    claudeCode: JSON.stringify(
      {
        mcpServers: {
          rotapress: {
            type: "http",
            url: endpoint,
            headers: { Authorization: "Bearer ${ROTAPRESS_MCP_KEY}" },
          },
        },
      },
      null,
      2,
    ),
    codex: `[mcp_servers.rotapress]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = "ROTAPRESS_MCP_KEY"\nenabled_tools = ${JSON.stringify(contentTools)}\n`,
    desktop: JSON.stringify(
      {
        mcpServers: {
          rotapress: {
            command: "node",
            args: [
              "--env-file=/absolute/private/rotapress-mcp.env",
              "/absolute/path/to/RotaPress/scripts/mcp_bridge.mjs",
            ],
          },
        },
      },
      null,
      2,
    ),
    openai: `import os\nfrom openai import OpenAI\n\nresponse = OpenAI().responses.create(\n    model=os.environ["OPENAI_MODEL"],\n    input="Call automation_prompt for my reference URL and prepare private drafts using verified club facts. Return review links.",\n    tools=[{\n        "type": "mcp",\n        "server_label": "rotapress",\n        "server_url": ${JSON.stringify(endpoint)},\n        "authorization": os.environ["ROTAPRESS_MCP_KEY"],\n        "allowed_tools": ${JSON.stringify(contentTools)},\n        "require_approval": "never",\n    }],\n)\nprint(response.output_text)`,
    anthropic: `import os\nimport anthropic\n\nresponse = anthropic.Anthropic().beta.messages.create(\n    model=os.environ["ANTHROPIC_MODEL"],\n    max_tokens=4096,\n    messages=[{"role": "user", "content": "Call automation_prompt for my reference URL and prepare private drafts using verified club facts. Return review links."}],\n    mcp_servers=[{\n        "type": "url",\n        "name": "rotapress",\n        "url": ${JSON.stringify(endpoint)},\n        "authorization_token": os.environ["ROTAPRESS_MCP_KEY"],\n    }],\n    tools=[{\n        "type": "mcp_toolset",\n        "mcp_server_name": "rotapress",\n        "default_config": {"enabled": False},\n        "configs": {name: {"enabled": True} for name in ${JSON.stringify(contentTools)}},\n    }],\n    betas=["mcp-client-2025-11-20"],\n)\nfor block in response.content:\n    if block.type == "text":\n        print(block.text)`,
  };
}
