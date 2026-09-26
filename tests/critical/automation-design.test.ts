import { describe, expect, it } from "vitest";
import {
  designOperations,
  websiteDesign,
} from "@/integrations/automation/design_operations";
import { outputJsonSchema } from "@/integrations/automation/operation";
import {
  cmsDataSchema,
  cmsBlockSchema,
  flattenBlocks,
  isSitePart,
} from "@/features/cms/cms_schemas";
import { copyPageTemplate } from "@/features/cms/page_templates";
import { validateContent } from "@/features/cms/cms_validation";
import { sitePartStarter } from "@/features/cms/site_part_starter";
import { eventOnlyBlockTypes } from "@/features/events/event_content";
import { eventLayoutIdSchema } from "@/features/events/event_layouts";

describe("C14 native design discovery", () => {
  it("publishes one bounded schema with executable blocks removed at every nesting level", () => {
    const design = websiteDesign();
    expect(designOperations[0].output.safeParse(design).success).toBe(true);
    expect(JSON.stringify(design.dataSchema)).not.toContain("CustomCode");
    expect(JSON.stringify(design.dataSchema)).not.toContain('"javascript"');
    expect(JSON.stringify(design).length).toBeLessThan(256 * 1024);
    expect(
      JSON.stringify(outputJsonSchema(designOperations[0].output)),
    ).not.toContain('"const":"Hero"');
    const knownBlocks = cmsBlockSchema.options.map(
      (schema) => schema.shape.type.value,
    );
    for (const context of design.contexts) {
      expect(context.allowedBlockTypes).not.toContain("CustomCode");
      for (const type of context.allowedBlockTypes)
        expect(knownBlocks).toContain(type);
    }
  });

  it("retains resolvable JSON Schema references after excluding executable branches", () => {
    const schema = websiteDesign().dataSchema;
    function walk(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("$ref" in value && typeof value.$ref === "string") {
        expect(value.$ref.startsWith("#/")).toBe(true);
        let target: unknown = schema;
        for (const part of value.$ref.slice(2).split("/")) {
          const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
          target =
            target && typeof target === "object"
              ? Reflect.get(target, key)
              : undefined;
        }
        expect(target, value.$ref).toBeDefined();
      }
      Object.values(value).forEach(walk);
    }
    walk(schema);
  });

  it("advertises templates only in compatible native content and event contexts", () => {
    const design = websiteDesign();
    for (const template of design.pageTemplates) {
      for (const contextId of template.contexts) {
        const context = design.contexts.find((item) => item.id === contextId)!;
        const data = isSitePart(context.kind)
          ? sitePartStarter(context.kind)
          : copyPageTemplate(template.id);
        expect(cmsDataSchema.safeParse(data).success, template.id).toBe(true);
        expect(
          () => validateContent(data, context.kind),
          `${template.id} in ${contextId}`,
        ).not.toThrow();
        for (const block of flattenBlocks(data.content))
          expect(
            context.allowedBlockTypes,
            `${template.id} in ${contextId}`,
          ).toContain(block.type);
        if (!context.eventModule) {
          expect(data.root.props.eventDesign).toBeUndefined();
          expect(data.root.props.eventHiddenSections).toBeUndefined();
          expect(data.root.props.eventLayout).not.toBe("standalone");
          expect(
            flattenBlocks(data.content).some((block) =>
              eventOnlyBlockTypes.some((type) => type === block.type),
            ),
          ).toBe(false);
        }
        if (context.eventModule && context.eventModule !== "website")
          expect(template.id).toBe("blank");
        if (context.kind !== "page") expect(template.id).toBe("blank");
      }
    }
    expect(design.eventLayouts.map((layout) => layout.id)).toEqual(
      eventLayoutIdSchema.options,
    );
    expect(
      design.pageTemplates.find(
        (template) => template.id === "event-layout:gala",
      )?.contexts,
    ).toEqual(["event:website"]);
  });
});
