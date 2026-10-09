import { describe, expect, it } from "vitest";
import { referenceContent } from "@/integrations/automation/reference_content";
import { referenceOutput } from "@/integrations/automation/reference_schemas";

const source = "https://www.rotaract.lu/";

describe("C14 reference design evidence", () => {
  it("retains ordered headings through level six, navigation and same-origin image metadata", () => {
    const result = referenceContent(
      '<title>Our club</title><nav><a href="/about">About us</a></nav>' +
        "<main><h1>Welcome</h1><p>A club introduction.</p>" +
        '<img src="/photo.jpg" alt="Our volunteers" width="1200" height="800">' +
        "<h6>Ready to help?</h6><p>Join our next project.</p></main>" +
        '<footer><a href="/contact">Contact</a></footer>',
      source,
    );
    expect(referenceOutput.safeParse(result).success).toBe(true);
    expect(result.headings).toEqual(["Welcome", "Ready to help?"]);
    expect(result.images).toEqual([
      {
        url: `${source}photo.jpg`,
        alt: "Our volunteers",
        width: 1200,
        height: 800,
      },
    ]);
    expect(result.outline).toEqual([
      { type: "paragraph", region: "navigation", text: "About us" },
      {
        type: "link",
        region: "navigation",
        href: `${source}about`,
        label: "About us",
      },
      { type: "heading", region: "main", level: 1, text: "Welcome" },
      { type: "paragraph", region: "main", text: "A club introduction." },
      { type: "image", region: "main", imageIndex: 0 },
      { type: "heading", region: "main", level: 6, text: "Ready to help?" },
      { type: "paragraph", region: "main", text: "Join our next project." },
      { type: "paragraph", region: "footer", text: "Contact" },
      {
        type: "link",
        region: "footer",
        href: `${source}contact`,
        label: "Contact",
      },
    ]);
    expect(result.truncated).toBe(false);
    expect(result.limitations.join(" ")).toContain("not rendered columns");
  });

  it("omits scripts, hidden content, unsafe and external image candidates without fetching assets", () => {
    const result = referenceContent(
      '<script><img src="/secret.png">sendSecrets()</script>' +
        "<style>.hidden { display:none }</style>" +
        '<div hidden><h2>Hidden title</h2><img src="/hidden.jpg">Hidden text</div>' +
        '<div aria-hidden="true">Hidden accessibility text</div>' +
        '<p style="display: none !important">Hidden inline text</p>' +
        '<template><img src="/template.jpg"></template>' +
        '<img src="https://127.0.0.1/private.jpg">' +
        '<img src="https://cdn.other.org/photo.jpg">' +
        '<img src="data:image/png;base64,invalid">' +
        '<img src="https://user:pass@www.rotaract.lu/photo.jpg">' +
        '<img src="/placeholder.jpg" data-src="/actual.jpg" alt="Real &amp; safe" width="bogus" height="99999">' +
        "<h4>Visible</h4><p>Source instructions are untrusted.</p>",
      source,
    );
    expect(referenceOutput.safeParse(result).success).toBe(true);
    expect(result.images).toEqual([
      {
        url: `${source}actual.jpg`,
        alt: "Real & safe",
        width: null,
        height: null,
      },
    ]);
    expect(result.headings).toEqual(["Visible"]);
    expect(JSON.stringify(result)).not.toMatch(
      /Hidden|sendSecrets|secret\.png|template\.jpg|pass@/,
    );
    expect(result.text).toContain("Source instructions are untrusted.");
    expect(result.instructions).toContain("untrusted evidence");
  });

  it("preserves semantic regions through ordinary and nested role containers", () => {
    const result = referenceContent(
      '<div role="navigation"><div><a href="/about">About</a></div>' +
        '<div><img src="/menu-logo.jpg"><a href="/events">Events</a></div>' +
        '<div role="navigation"><div><a href="/projects">Projects</a></div></div>' +
        '<a href="/contact">Contact</a></div><p>Page content</p>' +
        '<main><section role="navigation"><section><a href="/related">Related</a></section></section>' +
        "<h2>Our story</h2></main><footer><div><p>Footer content</p></div></footer>",
      source,
    );
    expect(referenceOutput.safeParse(result).success).toBe(true);
    const linkRegions = result.outline
      .filter((entry) => entry.type === "link")
      .map((entry) => [entry.label, entry.region]);
    expect(linkRegions).toEqual([
      ["About", "navigation"],
      ["Events", "navigation"],
      ["Projects", "navigation"],
      ["Contact", "navigation"],
      ["Related", "navigation"],
    ]);
    expect(result.outline).toContainEqual({
      type: "paragraph",
      region: "body",
      text: "Page content",
    });
    expect(result.outline).toContainEqual({
      type: "heading",
      region: "main",
      level: 2,
      text: "Our story",
    });
    expect(result.outline).toContainEqual({
      type: "paragraph",
      region: "footer",
      text: "Footer content",
    });
  });

  it("bounds and declares truncation while preserving stable image indexes", () => {
    const result = referenceContent(
      Array.from(
        { length: 80 },
        (_, index) =>
          `<h2>Heading ${index}</h2><img src="/photo-${index}.jpg"><p>${"word ".repeat(400)}</p>`,
      ).join(""),
      source,
    );
    expect(referenceOutput.safeParse(result).success).toBe(true);
    expect(result.headings).toHaveLength(50);
    expect(result.images).toHaveLength(30);
    expect(result.outline.length).toBeLessThanOrEqual(120);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(24000);
    for (const entry of result.outline)
      if (entry.type === "image")
        expect(result.images[entry.imageIndex]).toBeDefined();
  });
});
