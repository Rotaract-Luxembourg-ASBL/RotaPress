---
name: rotapress-website-template
description: Add or change a complete RotaPress website template, including its example pages, menu, shared parts, appearance and assets. Use for the built-in template catalogue and setup workflow; event presets use the separate event builder.
---

# RotaPress website templates

Read the repository's AGENTS.md and docs/development/roadmap.md, then
[website templates](../../docs/guides/website-kits.md). The current contract is a complete
private website installation, not a collection of demo pages added on preview.

## Structure

Start from an existing directory under
`src/features/cms/kits/templates/`. Each template owns:

- `metadata.ts`: visible name, family, description, included `websiteRecipes` and
  ordered `menuRecipes`. Include home, header and footer. Menu recipes must belong
  to the installed website and be pages.
- `definition.ts`: actual recipe-to-document composition. Reuse useful block
  factories and shared recipes, but put template-specific composition here.

Register the metadata in `kits/catalogue.ts` and the composition in
`kits/template_registry.ts`. Add its stable ID to `kitIdSchema` and the appearance
registry in `cms/appearance.ts`. Update appearance validators, CSS theme selectors
and any explicit typed registries identified by searching an existing ID.
Existing stable IDs must remain readable by saved revisions.

`kits/recipes.ts` creates editable documents; `RecipeContext` provides page links,
project IDs, images and optional form bindings. Use these references instead of
hardcoded URLs, database IDs or imported participant data. Bind real existing
Forms/Events/Partners services; an example must not fabricate live records.

Bundle reviewed assets under `public/templates/`, with source and usage notes.
Use the exact built-in asset catalogue for packaged photographs and the dedicated
SiteBrand option for official template artwork. Uploaded media remains subject
to existing visibility checks. Do not add arbitrary asset URLs or relax validation.
Keep official logos intact and distinguish masterbrands from club signatures.
Capture the real template preview for `public/kit-previews/<stable-id>.png`.

## Setup and editing

Extend the existing `WebsiteSetupService` and `WebsitePreviewService` only when the
template actually needs it. Keep their common lifecycle:

1. Catalogue preview composes documents in memory; it writes no CMS rows.
2. Selection creates private CMS identities/revisions and selects home, navigation,
   header, footer and appearance atomically in versioned site settings.
3. Repeated selection keeps edited copies. Existing unrelated content remains.
4. Publication reviews exact saved revision IDs and the site version, then publishes
   the selected website and settings in one transaction. Draft saves stay private.

Do not add template-specific editors, content tables, permission systems or
activation paths. Pages stay editable with common blocks; menus remain shared
references. Template selection never activates event features. Optional new page
layouts belong in the existing page-layout picker, not a second installer.

## Validation

Run affected C03/C04 checks in `tests/critical/cms.test.ts`; add a focused case only
for a new lifecycle/security condition. Verify zero-write preview, idempotent setup,
kept edits, stale revision rejection, atomic failure and private media boundaries.
Reuse B02 (`tests/browser/cms.spec.ts`) for template selection, menu/header/footer,
private preview and publication. Inspect the actual homepage and an inner page at
desktop and phone widths, including navigation, images, forms and overflow.

At a completed slice run `node scripts/pnpm.mjs verify` and
`node scripts/pnpm.mjs doctor`, record actual results in the pull request or local
handover, and keep all authored files below 800 physical lines. Do not repeat unchanged passing suites
unless later changes affect them. Template installation into developer data,
archiving old pages and publication need task authorization; source edits alone
do not request or imply those data changes.
