# Rotary Template and Rotaract Template

A template is a complete, editable website setup. Both templates use the same CMS,
Puck blocks, immutable revisions, media, forms and authorization as ordinary pages.
Stable stored IDs remain `rotary-service` and `rotaract-action` for compatibility.

## Use a template

Open **Website → Templates** at `/admin/website?tab=templates`.

1. **Preview template** opens a whole example with working page navigation. It is
   an authorized, uncached preview and creates no pages, forms or events.
2. **Use Rotary Template** or **Use Rotaract Template** reviews the included pages.
   **Set up my website** creates private editable copies and selects the homepage,
   seven-link menu, shared header/footer and matching appearance together.
3. Edit through the website sidebar: **Pages**, **Menus**, **Header & footer** and
   **Appearance**. New pages have one Page layout selector, including Blank page.
4. **Preview website** combines the saved draft pages, menu, parts and appearance.
   It does not accept form submissions. Unsaved editor input is not included.
5. **Publish website → Entire website** reviews the saved pages and publishes them
   with website settings in one transaction. The review names blocking images and
   links to their Media editor. Once published, **Menu only** can update navigation
   without including pending page or branding drafts; it is the default from Menus.
   Stale revisions and invalid references still reject publication. Ordinary page
   publication remains available in the page editor. See [publication guidance](website-publication.md).

Saving settings or selecting a template leaves the public website unchanged.
Selecting the current template again preserves edited content and settings. When
switching back to a previously used template, its existing copies are reused.
Unrelated pages are never deleted by selection. **Pages → Collection** distinguishes
This website, All saved pages and Previous examples; Publication includes Archived.
Archived copies remain readable and can be duplicated into an editable draft.

New template setups allocate readable page slugs such as `about` and `contact`,
with numeric suffixes when a draft or published path is already reserved. Existing installed pages keep their URLs and edits.

The legacy `/admin/website/kits`, `/site`, and `/site-editor` entries redirect into
this workspace. Low-level recipe copying remains shared by setup and existing
tools; there is no second installer, renderer or template upload mechanism.

## Included website and layouts

Each fresh installation includes eleven pages plus its header and footer: Home,
About, Projects, Project detail, Events, Calendar, Our team, Join, Contact, Gallery
and Partners. Home, About, Projects, Events, Calendar, Join and Contact form the
initial menu. Our team, Partners and Gallery also have footer links. The homepage and menu can
be changed, and menu links can be renamed, added, removed and reordered.

| Layout | Rotary Template | Rotaract Template |
| --- | --- | --- |
| Header/footer | Compact family mark and club name, service invitation, light footer with blue accent | Compact family mark and club name, activity invitation, light footer with cranberry accent |
| Home | Photograph overlay, introduction, projects, events, agenda and partners | Split hero, next activity, benefits, projects, agenda, partners and gallery |
| Projects/detail | Centered introduction, selected story cards, reading column | Left-aligned stories, strong card accents and invitation |
| About | People/story section and club values | Reversed image/story composition and values |
| Events | Real published upcoming and past event feeds | Activity-led introduction with the same event service |
| Calendar | Month calendar, event link and subscriptions | Same connected calendar with an activity-led introduction |
| Our team | Published Team directory profiles and membership invitation | Same directory connection with community-focused copy |
| Join | Service introduction, steps and FAQ | People-led invitation, steps and FAQ |
| Contact | Narrow information beside a form area | Balanced contact/form columns |
| Gallery | Captioned image grid and manual slider | Captioned grid/slider with action styling |
| Partners | Automatic published Partner and Sponsor categories and invitation | Same directory connections and collaboration invitation |

Optional News, Story, Legal and event-detail starting layouts remain available to
their existing editors. Legal content requires the club's actual reviewed text.
Patterns and block controls support different arrangements without changing the
template lifecycle. Sliders have named manual controls and do not autoplay.

Both templates use a compact white header with the logo and community identity
alongside navigation and account actions. The official family mark remains intact;
the configured club name is separate. At narrower widths, navigation uses a compact
menu and the account actions move onto a second row.

The footer has a lightly tinted background, an accent top border and restrained
headings. Identity, site navigation and the invitation occupy separate columns;
menu links use two columns, and the layout stacks on smaller screens. These shared
styles live in `src/app/styles/website-chrome.css` and apply to the template website
shell. Header/footer content and navigation remain editable through their existing
CMS and menu controls.

The template contains editable starting copy and illustrative garden photographs,
not claimed club achievements. Replace these with the club's own content. Empty
event/partner selections collapse; templates do not fabricate sponsors, bookings
or participant records. New setup creates and binds a private Contact form when
Forms is enabled and the author can edit forms. Review and publish it in Forms
before publishing the website. Join falls back to the real membership entry point
when no membership form is bound. No notification recipients or invented email
addresses are configured.

Calendar blocks inherit the club's configured time zone during complete setup.
They use the existing audience-aware feed; templates create no calendars,
activities, registrations or people. Setup omits Calendar blocks when that feature
is disabled. A fresh website uses the latest recipes. Selecting an already used
template preserves its saved copies, including older sets without Calendar or Our
team. Add those layouts through **Pages → New page** when updating an existing site.
This refresh does not add a destructive reset or replace saved page content.

The website overview links to Calendar, Events, Contact form and Directory. The
block library groups Calendar & events, Contact & participation and People & shared
content, with ready sections for agendas, forms and automatic directory categories.
Calendar and Events settings link to their owning workspace. Form blocks use the
current form preview, including design, conditional questions and page navigation;
the final Send button is disabled. Authorized editors can preview saved form drafts.
Catalogue Contact previews use an in-memory example and create no form records.

## Template structure

`src/features/cms/kits/templates/rotary-template/` and `rotaract-template/` each own
`metadata.ts` and `definition.ts`. Metadata defines display name, family, description,
installed recipes and menu order. Definitions map recipes to actual CMS document
composition. Shared block factories remain in the existing recipe helpers.

`kits/catalogue.ts` exposes metadata and validation; `kits/template_registry.ts`
registers composition; `kits/recipes.ts` creates editable copies.
`WebsiteSetupService` coordinates selection and reviewed publication using existing
transaction-capable services. `WebsitePreviewService` builds private projections.
The versioned `templateSetup` field stores installed recipe IDs and current selection;
no additional database table or migration is needed for this refinement.

Use the repository [template authoring skill](../../skills/rotapress-website-template/SKILL.md)
when adding a template. It identifies registration points, asset boundaries,
lifecycle invariants and the existing acceptance journeys.

## Images and identity

Unmodified Rotary and Rotaract masterbrand PNGs are bundled as explicit template
identity choices. See [brand asset provenance](../../public/templates/BRAND_ASSETS.md)
for source URLs, dimensions, file hashes and usage guidance. The configured club
name is shown separately; the template does not generate an official club signature.
An uploaded club logo takes precedence and still requires public-media validation.
Use the club's actual Brand Center signature for its final identity.

**Website → Branding & appearance** owns the shared logo, browser icon, alternative
text, fallback mark, club-name visibility, accent color and heading style. These
are versioned site settings: saving prepares a private draft; website publication
makes them visible. Template selection preserves explicit branding and appearance
choices. Header/footer `SiteBrand` blocks inherit this identity unless their own
uploaded logo overrides it. New templates should leave that override empty.

The shared public shell also renders standalone forms, sign-in, membership,
registrations, guest access and recovery with the published website header/footer
and appearance. Independent event landing pages retain their event design.
Private logo/icon assets may be previewed by authorized editors but cannot be
published. Published media references prevent deletion or making a live logo private.

Photographs are packaged under `public/templates/shared/` and selected through an
exact allowlist in `kits/template_images.ts`. Arbitrary paths, remote URLs and
unknown template references are rejected. Uploaded UUID assets continue to use
normal organization scope and visibility checks. Existing image controls replace
a packaged photo with a selected Media image.

| Photograph | Creator and source | Packaged file |
| --- | --- | --- |
| Greenhouses and raised garden beds | [Matt Baker](https://unsplash.com/photos/greenhouses-and-garden-with-yellow-fence-in-sunlight-mgEKkITagkQ) | `garden.jpg` |
| Young plants in soil | [Markus Spiske](https://unsplash.com/photos/green-plant-on-brown-soil-vCCeCZGcfSY) | `seedlings.jpg` |
| Herbs in bamboo containers | [David Clode](https://unsplash.com/photos/a-bunch-of-plants-that-are-in-a-garden-Y0y5kwKdZVA) | `herbs.jpg` |

Photographs were downloaded under the [Unsplash license](https://unsplash.com/license),
with [terms](https://unsplash.com/terms) reviewed separately. They show no recognizable
participant faces or official marks and carry no affiliation or achievement claim.
Image rights and official trademarks are separate from the application's code license.
Colors follow the [Rotary color guidance](https://brandcenter.rotary.org/en-us/our-brand/brand-elements/colors);
the implementation uses the available Arial system fallback rather than bundling
licensed font files. Carousel interaction follows the
[WAI guidance](https://www.w3.org/WAI/tutorials/carousels/).

## Verification and boundaries

C03/C04 cover private content, exact revisions, template replay, atomic publication,
archived page handling and asset validation. B02 covers setup, editing, settings,
preview and publication in the browser. See [testing](../development/testing.md)
for commands; distinguish synthetic fixtures from real installation changes.

Templates never change identity, memberships, module state, registration authority,
credentials or uploaded media visibility. No marketplace, executable template
uploads, public deployment, event content engine or general demo seeder is added.
Locale selection creates a variant in that locale; starting copy still needs actual
translation. Real Google and Luma verification remains a separate task.
