# Backstage Headless Starter

A custom-site starting point using Astro and the framework-neutral Backstage SDK. Astro owns the route map, layouts, and block renderers. Backstage owns the editable content and media.

The site builds to static HTML. The SDK runs only during the build, so API credentials are not sent to visitors. A content change requires a new build and deploy; cache-only publishing is not implemented in this starter.

## Requirements

- Node.js 22.12 or newer
- An account configured for Headless rendering and Application owned routing in Backstage
- A read-only Backstage API key and account ID for API builds

## Local setup

Install dependencies with npm ci. Copy .env.example to .env and leave BACKSTAGE_SOURCE=fixture for the sample site. The fixture includes a Happenings blueprint index and location-nested entry route to preview generic route rendering and public-entry filtering. Start the dev server with npm run dev.

To build and preview the static site, run npm run build and then npm run preview. The sample fixture is also used in CI, so validation does not need Backstage credentials.

## Backstage content

Set BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, and optionally BACKSTAGE_API_URL to build from an account. The default API URL is https://bckstg.app/api. `BACKSTAGE_PAGE_MODE` defaults to `headless`. Keep the API key in the build environment's secret store; never add it to client-side code or a public-prefixed environment variable.

The starter reads the generic Websites, Pages, route graph, and Navigation APIs through @antlur/backstage. It does not use Frontstage endpoints. For now, an account must have exactly one website because the SDK Pages method does not yet filter pages by website. Page blocks must use the Headless shape with id, type, optional variant, and fields. A mismatch stops the build with an actionable error rather than silently dropping content.

Social profiles are website-level settings, not page blocks. Configured social links render as accessible icon links in the global footer only when Backstage provides a valid HTTPS URL. A platform name without a URL is omitted rather than shown as a nonfunctional link.

Published Backstage alerts render only when their schedule and route targeting match the current page. Banners appear above the site header; pop-ups use an accessible dialog and honor the center or bottom-right position. Alert publication, schedule, and route visibility are evaluated at build time, so changes appear with the next build/deploy. On small screens, the first navigation item styled as a button becomes the persistent action; the website CTA is used only when no navigation button exists.

For this starter, configure the website as **Headless application** with **Application owned** routing in Backstage Settings > Rendering. Backstage's canonical website route graph controls which CMS pages are generated. Pages are matched by their `pathname`, so nested pages and future CMS pages are included without duplicating the route list in the app. Pages outside the graph are not published. Routable blueprint index and entry routes are resolved at build time through the SDK and rendered with a generic field renderer; canonical paths come from Backstage, and collection links only include entries present in the public route graph. The starter renders generated Events, Location, Menu, and Press routes from canonical route paths and matching records; missing records stay unhandled rather than leaking unlisted content. For other application-owned routes, add paths to `applicationRoutePaths` in `src/site/routes.ts` and implement Astro page files. Duplicate paths are rejected except where Backstage exposes the Events index alongside a CMS page at `/events`; in that confirmed case, the generated system route owns the public path. Unhandled routes are reported during non-indexable builds and fail an indexable production build, preventing module routes from silently shipping as 404s.

Navigation is read from Backstage. If the account has exactly one navigation, the starter uses it. If there are multiple, set `BACKSTAGE_NAVIGATION_ID` to select one. With no saved navigation, the site shows no page links; create a curated navigation in Backstage before launch. The setup check reports this as an incomplete prerequisite.

## Blocks and layouts

There is one Astro component per block in src/blocks and one shared site shell in src/layouts/SiteLayout.astro. Register each block in src/components/BlockRenderer.astro. An unregistered block or unsupported variant fails the build until its renderer is implemented.

Block manifests under `blocks/**/manifest.json` are recursively discovered for both Backstage sync and build validation. Application-defined blocks need a local semantic manifest and an explicit Astro renderer in `src/components/BlockRenderer.astro`; they do not need a PHP block class.

The starter includes Hero, Rich Text, Image, Image Gallery, Media with Text, Card Grid, Call to Action, Menu, Upcoming Events, Instagram Feed, and Contact Form blocks. Menu selects and renders canonical Backstage menu data. Call to Action and Hero support multiple action links. Image and card media use accessible alt text and responsive rendering; Image Gallery can show full images without cropping, and Card Grid supports optional links. The Contact Form block selects an existing Backstage form, reads its configured fields during the static build, and submits to Backstage's existing public form endpoint. It supports configured field types, file uploads, inline success/error messages, and reCAPTCHA v3 when the form definition includes a site key. Editorial blocks sanitize rich-text fields before rendering; do not pass CMS HTML directly to set:html.

Block schemas for Backstage's headless editor live in blocks/<slug>/manifest.json. Run npm run setup for a read-only account check and block-sync preview. After enabling the CMS Custom Blocks module, run npm run setup -- --apply with an account token that can manage blocks to sync all Starter definitions. Keep this write-capable token separate from the read-only token used by API builds. Setup checks block identities and slugs before writing and refuses to overwrite an unregistered block with a matching slug; adopt it only after review with npm run sync:blocks -- --adopt-unregistered=hero. API builds verify that Custom Blocks is enabled and that every used block matches its starter identity and schema; this prevents publishing pages that render but cannot be fully edited in Backstage. npm test checks that block manifests stay aligned with the starter's renderers and that build readiness catches missing or stale setup. For local Backstage certificates, run commands that call Backstage with NODE_OPTIONS=--use-system-ca, for example NODE_OPTIONS=--use-system-ca npm run setup or NODE_OPTIONS=--use-system-ca npm run build. This makes Node trust locally installed system certificates while keeping TLS verification enabled. NODE_OPTIONS is read when Node starts, so set it in the shell or process manager, not in .env; do not disable TLS verification.

To create a generic site skeleton, first sync block definitions with `npm run setup -- --apply`. Then review the page plan with `npm run setup -- --site`; after checking it, use `npm run setup -- --site --apply` to create only missing Home and About pages. Page initialization refuses to run while block definitions need syncing. Existing pages are preserved. New pages are immediately part of the account's CMS route graph and may appear in the next site build; the API does not provide draft creation. This flow does not change website settings or navigation. Curate navigation links in Backstage after setup because the current API does not support writing navigation items. Branding, media, SEO metadata, and module-specific content remain manual.

The Contact page is optional and is created only when a configured form is selected. Verify its fields, recipient, reCAPTCHA, and spam settings in Backstage, then pass `--contact-form-id <id> --confirm-contact-form-recipient` to the setup command. The API can confirm that the form has fields but cannot verify recipient or delivery behavior; no test submission is sent by setup.

The Upcoming Events block reads events from Backstage at build time and requires the Engagement Events module. It renders only future or in-progress events, ordered by start time. Generated event detail pages are limited to event slugs in the public route graph. Menus can be routed from navigation relationships or canonical `/menu/{slug}` paths; the `/menu` index uses the public menu routes. Location pages render structured hours, directions, and a Google Maps embed only when the embed URL has the expected Google Maps origin and path.

### Legacy migration preview

`BACKSTAGE_PAGE_MODE=legacy-preview` is an optional, read-only compatibility tool for a deliberately selected test account that already contains legacy PHP blocks. It uses the regular Backstage website, route, navigation, menu, location, event, press, form, media, and Instagram APIs, then maps supported legacy block types to equivalent starter renderers. Unsupported types fail with the page and block name. Forms are displayed with disabled fields and cannot submit in this mode.

Legacy Preview is not the new-site setup or migration path. Do not use customer content or assets as starter data. New sites should use the default `headless` mode, sync the starter's account-block definitions, and create their own pages and content in Backstage. Legacy Preview is never a production publishing mode: it is API-only, rejects indexable output, does not change account settings, does not submit forms, and does not write to Backstage. Routes outside Backstage's canonical public route graph are not published.

Menu pages render the full category and placement model, including local menu-item overrides and multiple prices. Press index and detail pages are generated only for paths present in Backstage's public route list; unlisted Press records are excluded from the public output.

Page-specific layouts are code-owned Astro components, one file per layout under src/layouts/pages. The Backstage field definitions live in src/site/page-layout-definitions.ts and are exposed to the SDK CLI through backstage/config.ts. Run npm run sync:layouts with the account's CMS Custom Layouts module enabled and a token that can manage layouts. Assign a synced layout to a page in Backstage; Astro passes its data and the page settings to the matching component. Pages with no assigned layout use Standard Page. API builds verify that Custom Layouts is enabled and the assigned layout's field schema matches the local definition. An assigned layout without a matching component fails the build, so register the renderer before assigning a new layout slug.

## Design tokens

CSS custom properties are the canonical design-token source. `src/styles/global.css` wires the token files into Tailwind CSS v4 and imports only its theme and utility layers, preserving the starter's existing native styles. `src/styles/tokens/brand.css` contains portable identity colors and font-family stacks; it is committed and code-managed until an explicit Backstage sync workflow is configured. Normal development and builds never mutate it. Font asset loading remains site-owned.

`src/styles/tokens/theme.css` maps identity into site-owned semantic roles such as background, surface, foreground, muted, action, accent, and heading/body fonts. Use those semantic properties or Tailwind utilities such as `bg-action`, `text-foreground`, and `font-heading` in new presentation code. `src/styles/tokens/ui.css` is reserved for a small set of site-owned mechanics such as radius, spacing, container width, and page gutter. Do not add component-specific values there unless they are genuinely reused. Existing flat color/font variables are compatibility aliases; do not add new uses of them.

Brand tokens describe identity, not component appearance. Change `theme.css` for site-specific semantic choices, `ui.css` for shared interface mechanics, and component styles for one-off presentation. Do not add a UI library or a runtime Backstage theme request for token access.

For a new account, set Headless rendering and Application owned routing, enable CMS Custom Blocks, sync the manifests, then optionally create the generic site skeleton. An API build with page blocks stops if Custom Blocks is disabled or a page references a block definition that has not been synced, because those blocks would not be editable in Backstage.

To use a Contact Form block, create and configure its fields in Backstage, sync the block manifest, then select the existing form in the block editor. Older forms without configured fields need field definitions before they can be rendered. The public reCAPTCHA site key is read from Backstage; register each production hostname with the matching reCAPTCHA configuration. The secret API token is only used during the build and is never sent to site visitors.

## Search indexing

The default build is noindex and robots.txt disallows crawling. This is suitable for local previews and unpublished environments.

Netlify Deploy Previews and branch deploys use fixture content and stay noindex. Before enabling production deploys, configure BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, SITE_URL, and SITE_INDEXABLE=true in the production build environment. Keep secrets in Netlify's environment settings, not netlify.toml.

For a production build, set SITE_URL to the final HTTPS origin and SITE_INDEXABLE=true. This enables canonical and Open Graph URLs, an XML sitemap, and crawlable robots.txt. The build fails if indexing is enabled without an HTTPS URL. Do not enable indexing for preview deployments.

The shared layout includes page and site metadata, favicon and logo support, Open Graph and Twitter metadata, and generic Organization JSON-LD. Add a more specific schema type only when the site's actual business data supports it.

## Accessibility baseline

The starter includes semantic header, navigation, main, and footer landmarks; a skip link; visible keyboard focus; responsive layouts; reduced-motion handling; and image alt text from Backstage media or the block's imageAlt field. This is a starting baseline, not an accessibility conformance certification. Review each site's content, contrast, interactions, and complete rendered routes before launch.

## Validation

- npm run check validates Astro and TypeScript contracts.
- npm run build runs the checker and creates the static site.
- CI builds both a noindex preview and an indexable site with sitemap output.

The Astro compiler requires Node.js 22.12 or newer. Keep the SDK and Astro versions updated through reviewed dependency changes, then run both production build modes.
