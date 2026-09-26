---
name: rotapress-product-ux
description: Design, implement or review RotaPress administration and member workflows for people with no CMS or CRM experience. Use for panels, navigation, editors, creation flows, actions and status messages; also use the website-template skill when changing template recipes.
---

# RotaPress product UX

Read [the product UX rules](../../docs/development/product-ux.md) before changing a workflow.
Use AGENTS.md for project rules and docs/development/roadmap.md for current limits.
Design a coherent product that a first-time club volunteer can understand.
Adding a setting or changing a button's CSS alone does not resolve a confusing task.

## Work from the task

1. Inspect the running screen and trace the complete task: entry, creation,
   editing, preview, publication, response review and return to the list.
2. Write down the user's goal and the shortest understandable path. Identify
   duplicate controls, unexplained states and implementation concepts leaking
   into the interface. Use current data and permissions, not invented statistics.
3. Choose a consistent screen structure. Put a feature's settings in its own
   workspace. Reuse shared interactions; remove obsolete competing entry points.
4. Implement the complete affected flow, including empty, loading, error,
   read-only and unsaved states. Preserve working services and server authority.
5. Walk through it in a real browser at desktop and phone widths, using the
   visible labels. Check keyboard access, menu dismissal, focus return, overflow,
   save/publish boundaries and preservation of entered changes.
6. Update affected principal browser journeys and run focused checks. Record
   actual results and remaining limitations in the pull request or local handover.
   A screenshot verifies appearance, not persistence, authorization or beginner
   comprehension.

## Product decisions to preserve

- `/events` is the public event directory. Its built-in design belongs under
  **Events → Directory design**, with direct content/layout controls and preview.
  Selecting a CMS page under Website menus is not the primary design workflow.
- Forms has one dashboard, a clear New form entry, understandable templates,
  focused question editing, an interactive preview and explicit sharing options.
- Put common work such as Edit and View responses in sight. Put lifecycle actions
  in a compact, labeled overflow menu. Never make Remove the main row action.
- Call reversible removal Archive and irreversible removal Delete permanently.
  Review affected records before deletion. View responses from a form must open
  that form's filtered results, with visible context and an explicit way to clear it.
- Distinguish saved drafts from published content in plain language. Do not expose
  revisions, IDs or internal feature wiring as prerequisites to ordinary work.
- Settings have one owner. Link to that owner from related screens instead of
  making another independently editable copy.
- Routine reversible edits do not need repeated confirmations. Confirm actions
  whose consequences need review, stating what changes and what can be recovered.
- Keep administration styling independent of public branding, and preserve
  membership, publication, permission and private-data boundaries.
- For administration collections, follow the [shared workspace pattern](../../docs/development/admin-workspaces.md)
  and reuse `src/ui/collection.tsx`. State the scope of every count and keep
  feature-specific editing tasks inside their existing workspace.

Apply these rules proportionally to the request. They do not authorize unrelated
redesigns, new infrastructure, production changes or broader provider access.
Do not declare a beginner usability test passed without actual participant evidence;
describe an agent browser walkthrough as such.
