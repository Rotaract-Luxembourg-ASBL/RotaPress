import "server-only";
import type { cmsRevision } from "../../../db/schema/cms";
import { revisionInputSchema, type RevisionDto } from "./cms_schemas";
type Revision = typeof cmsRevision.$inferSelect;
import sanitizeHtml from "sanitize-html";
import { DomainError } from "../../core/authorization/AuthorizationService";
import { templateImage } from "./kits/template_images";
import {
  cmsDataSchema,
  isSafeLink,
  type CmsData,
  type CmsKind,
  type Block,
  flattenBlocks,
  isSitePart,
  sitePartBlockTypes,
} from "./cms_schemas";

/** Stored content is parsed again before rendering; only this allowlist reaches HTML. */
export function validateContent(input: unknown, kind: CmsKind): CmsData {
  const data = cmsDataSchema.parse(input);
  const blocks = flattenBlocks(data.content);
  if (
    isSitePart(kind)
      ? blocks.some(
          (item) => !sitePartBlockTypes.some((type) => type === item.type),
        )
      : blocks.some((item) => item.type.startsWith("Site"))
  ) {
    throw new DomainError(
      "BLOCK_SCOPE_INVALID",
      "Use the approved blocks for this page or shared site part. Content has not been discarded.",
      422,
    );
  }
  if (
    kind === "section" &&
    blocks.some((block) => block.type === "SharedSection")
  ) {
    throw new DomainError(
      "SECTION_NESTING_DISABLED",
      "Reusable sections cannot contain other reusable sections.",
      422,
    );
  }
  return {
    ...data,
    content: data.content.map(sanitizeBlock),
  };
}

function sanitizeBlock(block: Block): Block {
  if (block.type === "Columns")
    return {
      ...block,
      props: {
        ...block.props,
        left: block.props.left.map(sanitizeLeaf),
        right: block.props.right.map(sanitizeLeaf),
      },
    };
  if (block.type === "SiteRow")
    return {
      ...block,
      props: {
        ...block.props,
        left: block.props.left.map(sanitizeLeaf),
        center: block.props.center.map(sanitizeLeaf),
        right: block.props.right.map(sanitizeLeaf),
      },
    };
  return sanitizeLeaf(block);
}
function sanitizeLeaf<
  T extends Exclude<Block, { type: "SiteRow" | "Columns" }>,
>(block: T): T {
  if (block.type !== "RichText") return block;
  const safe = sanitizeHtml(block.props.text, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => ({
        tagName,
        attribs: isSafeLink(attributes.href ?? "") ? attributes : {},
      }),
    },
  });
  return { ...block, props: { ...block.props, text: safe } };
}

export function contentAssets(
  data: CmsData,
  socialImageId: string | null = null,
): string[] {
  const ids = new Set<string>();
  if (socialImageId) ids.add(socialImageId);
  for (const block of flattenBlocks(data.content)) {
    if (
      (block.type === "Image" ||
        block.type === "EventHero" ||
        block.type === "EventFlyer" ||
        block.type === "Hero" ||
        block.type === "SiteBrand" ||
        block.type === "Cover" ||
        block.type === "FeatureSection") &&
      block.props.assetId
    )
      ids.add(block.props.assetId);
    if (
      [
        "Gallery",
        "ImageSlider",
        "Team",
        "Sponsors",
        "HeroSlider",
        "Cards",
      ].includes(block.type) &&
      "items" in block.props
    ) {
      for (const item of block.props.items) {
        if (
          "assetId" in item &&
          typeof item.assetId === "string" &&
          item.assetId
        )
          ids.add(item.assetId);
      }
    }
  }
  // Bundled allowlisted files are public application assets, never media-library identities.
  return [...ids].filter((id) => !templateImage(id));
}

export function contentSections(data: CmsData): string[] {
  return [
    ...new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "SharedSection" ? [block.props.sectionId] : [],
      ),
    ),
  ];
}

export function contentForms(data: CmsData): string[] {
  return [
    ...new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "Form" ? [block.props.formId] : [],
      ),
    ),
  ];
}

export function contentPartners(data: CmsData): string[] {
  return [
    ...new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "PartnerCollection" &&
        block.props.selectionMode !== "category"
          ? block.props.partnerIds
          : [],
      ),
    ),
  ];
}

export function dynamicProfileCategories(data: CmsData): string[] {
  return flattenBlocks(data.content).flatMap((block) =>
    block.type === "PartnerCollection" &&
    block.props.selectionMode === "category"
      ? [block.props.category ?? "all"]
      : [],
  );
}

export function revisionDto(revision: Revision, kind: CmsKind): RevisionDto {
  const parsed = revisionInputSchema.parse({
    title: revision.title,
    slug: revision.slug,
    description: revision.description,
    socialImageId: revision.socialImageId,
    data: revision.data,
  });
  return {
    ...parsed,
    data: validateContent(parsed.data, kind),
    id: revision.id,
    createdAt: revision.createdAt.toISOString(),
  };
}
