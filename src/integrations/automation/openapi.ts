import { contractVersion, operations } from "./catalogue";
import { inputJsonSchema, outputJsonSchema, successSchema } from "./operation";
import { automationPrompts } from "./prompts";
import { binaryMediaUploadPath } from "./media_openapi";

// Zod references are local to each schema; nested OpenAPI components need absolute pointers.
export function rebaseSchema(value: unknown, root: string): unknown {
  if (Array.isArray(value))
    return value.map((item) => rebaseSchema(item, root));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "$ref" && typeof entry === "string" && entry.startsWith("#")
        ? root + entry.slice(1)
        : rebaseSchema(entry, root),
    ]),
  );
}

const errorDescriptions: Record<number, string> = {
  400: "Invalid input. Correct fields before retrying.",
  401: "Missing, expired or revoked key/session. Create a current connection.",
  403: "Denied origin, scope, membership or resource access.",
  404: "Unknown operation or unavailable resource.",
  409: "Revision conflict, changed import retry, or disabled feature.",
  413: "Request exceeds 256 KiB.",
  415: "Send application/json.",
  422: "Content or reference-source policy rejected the request.",
  429: "Quota exceeded. Back off for at least 60 seconds.",
  500: "Internal failure. Internal diagnostics are not returned.",
};

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, unknown> = {};
  for (const operation of operations) {
    const path = `/api/v1${operation.path}`;
    const input = inputJsonSchema(operation.input);
    const inputRoot = `#/components/schemas/${operation.name}_input`;
    const outputRoot = `#/components/schemas/${operation.name}_response`;
    schemas[`${operation.name}_input`] = rebaseSchema(input, inputRoot);
    schemas[`${operation.name}_response`] = rebaseSchema(
      outputJsonSchema(successSchema(operation.output)),
      outputRoot,
    );
    const properties = input.properties ?? {};
    const pathNames = [...path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    const parameters = Object.entries(properties)
      .filter(
        ([name]) => operation.method === "GET" || pathNames.includes(name),
      )
      .map(([name, schema]) => ({
        name,
        in: pathNames.includes(name) ? "path" : "query",
        required:
          pathNames.includes(name) || input.required?.includes(name) || false,
        schema: rebaseSchema(schema, inputRoot),
        example: operation.example[name],
      }));
    paths[path] ??= {};
    paths[path][operation.method.toLowerCase()] = {
      operationId: operation.name,
      summary: operation.name.replaceAll("_", " "),
      tags: [operation.scope?.split(":")[0] ?? "discovery"],
      description: operation.description,
      "x-rotapress-scope": operation.scope,
      "x-rotapress-read-only": operation.readOnly,
      security: [{ staffConnection: [] }],
      parameters,
      ...(operation.method !== "GET"
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: rebaseSchema(
                    {
                      ...input,
                      properties: Object.fromEntries(
                        Object.entries(properties).filter(
                          ([name]) => !pathNames.includes(name),
                        ),
                      ),
                      required: input.required?.filter(
                        (name) => !pathNames.includes(name),
                      ),
                    },
                    inputRoot,
                  ),
                  example: Object.fromEntries(
                    Object.entries(operation.example).filter(
                      ([name]) => !pathNames.includes(name),
                    ),
                  ),
                },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description:
            "Success. Private draft writes return saved state; imports return stable review receipts.",
          content: {
            "application/json": {
              schema: { $ref: outputRoot },
            },
          },
        },
        ...Object.fromEntries(
          [400, 401, 403, 404, 409, 413, 415, 422, 429, 500].map((status) => [
            status,
            {
              description: errorDescriptions[status],
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { error: { type: "string" } },
                    required: ["error"],
                  },
                },
              },
            },
          ]),
        ),
      },
    };
  }
  paths["/api/v1/media/upload"] = binaryMediaUploadPath();
  paths["/api/v1/openapi.json"] = {
    get: {
      operationId: "openapi_document",
      summary: "Download the OpenAPI 3.1 document",
      tags: ["discovery"],
      security: [{ staffConnection: [] }],
      responses: {
        "200": {
          description: "OpenAPI document; no data envelope.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["openapi", "info", "paths", "components"],
                properties: {
                  openapi: { const: "3.1.0" },
                  info: { type: "object" },
                  paths: { type: "object" },
                  components: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  };
  paths["/api/v1/prompts"] = {
    get: {
      operationId: "prompt_catalogue",
      summary: "List prompt names and arguments",
      tags: ["discovery"],
      security: [{ staffConnection: [] }],
      responses: {
        "200": {
          description: "Supported prompt descriptions.",
          content: {
            "application/json": {
              example: { data: automationPrompts },
              schema: {
                type: "object",
                required: ["data"],
                additionalProperties: false,
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "description", "arguments"],
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        arguments: {
                          type: "array",
                          items: {
                            type: "object",
                            required: ["name", "description", "required"],
                            properties: {
                              name: { type: "string" },
                              description: { type: "string" },
                              required: { type: "boolean" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    servers: [{ url: "/", description: "This RotaPress instance" }],
    info: {
      title: "RotaPress content automation",
      version: contractVersion,
      description:
        "Session-bound staff connections using scoped REST API tokens. Content writes stay private drafts; event settings are proposals for staff review. Discover scopes, schemas and workflow prompts before writing. JSON bodies are limited to 256 KiB; the dedicated binary image upload accepts up to 5 MiB.",
    },
    components: {
      schemas,
      securitySchemes: {
        staffConnection: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "RotaPress REST API token",
        },
      },
    },
    paths,
  };
}
