import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperationResult } from "../../src/integrations/automation/ui/operation-result";

describe("automation result recovery", () => {
  function render(data: object, mcp = false) {
    return renderToStaticMarkup(
      createElement(OperationResult, {
        result: {
          status: 200,
          ok: true,
          body: mcp ? { result: { structuredContent: { data } } } : { data },
        },
      }),
    );
  }
  it.each([
    [
      "members",
      "Members",
      { name: "Test member", status: "approved", role: "editor" },
      "Test member",
    ],
    ["albums", "Albums", { title: "Club album" }, "Club album"],
    ["forms", "Forms", { title: "Club enquiries" }, "Club enquiries"],
    [
      "submissions",
      "Responses",
      { formTitle: "Club enquiry", status: "new" },
      "Club enquiry",
    ],
    [
      "items",
      "Results",
      { asset: { title: "Club report.pdf" } },
      "Club report.pdf",
    ],
  ])(
    "summarizes %s with exact totals outside raw JSON",
    (key, label, item, text) => {
      const html = render(
        { [String(key)]: [item], total: 31, page: 2, pageSize: 30 },
        true,
      );
      const summary = html.split("<details>")[0];
      expect(summary).toContain(`aria-label="${label}"`);
      expect(summary).toContain(`<strong>${text}</strong>`);
      expect(summary).toContain("1 returned of 31 total · Page 2 of 2");
      expect(summary).not.toContain("More results available");
    },
  );
  it("keeps guest candidate and grant counts separate", () => {
    const html = render({
      candidates: [{ name: "Candidate" }],
      grants: [{ name: "Guest", status: "claimed" }],
      candidatePagination: { total: 80, page: 1, pageSize: 25 },
      pagination: { total: 1, page: 1, pageSize: 25 },
    }).split("<details>")[0];
    expect(html).toContain(
      "1 returned of 80 total · Page 1 of 4 · More results available",
    );
    expect(html).toContain("1 returned of 1 total · Page 1 of 1");
    expect(html).toContain("claimed");
  });
  it("bounds visual rows, escapes values and leaves unknown arrays collapsed", () => {
    const html = render({
      items: Array.from({ length: 60 }, (_, index) => ({
        title: `<script>${index}</script>`,
      })),
      total: 100,
      offset: 30,
      limit: 60,
      nextOffset: 90,
      internal: [{ name: "Hidden diagnostic" }],
    });
    const summary = html.split("<details>")[0];
    expect(summary.match(/<li>/g)).toHaveLength(50);
    expect(summary).toContain("Results 31–90");
    expect(summary).toContain("1–50 of 60 returned records");
    expect(summary).toContain("Next returned records</button>");
    expect(summary).toContain("&lt;script&gt;0&lt;/script&gt;");
    expect(summary).not.toContain("Hidden diagnostic");
    expect(html).not.toContain("<script>");
  });
  it("shows the actionable MCP tool error outside Advanced JSON", () => {
    const message =
      "This request ID belongs to another connection. Retry the original request.";
    const html = renderToStaticMarkup(
      createElement(OperationResult, {
        result: {
          status: 200,
          ok: false,
          body: {
            jsonrpc: "2.0",
            id: 2,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: message,
                    code: "AUTOMATION_REQUEST_CHANGED",
                  }),
                },
              ],
            },
          },
        },
      }),
    );
    expect(html).toContain(`<p role="alert">${message}</p>`);
    expect(html).toContain("Request failed");
  });
  it("renders protocol errors as escaped text", () => {
    const html = renderToStaticMarkup(
      createElement(OperationResult, {
        result: {
          status: 200,
          ok: false,
          body: {
            error: { code: -32602, message: "Invalid <script>input</script>" },
          },
        },
      }),
    );
    expect(html).toContain(
      '<p role="alert">Invalid &lt;script&gt;input&lt;/script&gt;</p>',
    );
    expect(html).not.toContain("<script>");
  });
});
