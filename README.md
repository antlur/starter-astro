# Backstage Headless Starter

A custom-site starting point using Astro and the framework-neutral Backstage SDK. Backstage owns the canonical public content routes, editable content, and media. Astro owns route templates, layouts, block renderers, and site-specific routes not represented in Backstage's graph.

The site builds to static HTML. The SDK runs only during the build, so API credentials are not sent to visitors. A content change requires a new build and deploy; cache-only publishing is not implemented in this starter.

For the shortest path from a new clone to a local site, see [New Site Quickstart](NEW_SITE_QUICKSTART.md).

## Requirements

- Node.js 22.23.4 or newer
- A Backstage account with its website configured for Headless rendering
- A read-only Backstage API key and account ID for API builds

## Local setup

Install dependencies with npm ci. Copy .env.example to .env and leave BACKSTAGE_SOURCE=fixture for the sample site. The fixture includes a Happenings blueprint index and location-nested entry route to preview generic route rendering and public-entry filtering. Start the dev server with npm run dev.

To build and preview the static site, run npm run build and then npm run preview. The sample fixture is also used in CI, so validation does not need Backstage credentials.

## Backstage content

Set BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, and optionally BACKSTAGE_API_URL to build from an account. The default API URL is https://bckstg.app/api. `BACKSTAGE_PAGE_MODE` defaults to `headless`. Keep the API key in the build environment's secret store; never add it to client-side code or a public-prefixed environment variable.

The starter reads the generic Websites, Pages, route graph, and Navigation APIs through @antlur/backstage. It does not use Frontstage endpoints. For now, an account must have exactly one website because the SDK Pages method does not yet filter pages by website. Page blocks must use the Headless shape with id, type, optional variant, and fields. A mismatch stops the build with an actionable error rather than silently dropping content.

Social profiles are website-level settings, not page blocks. Configured social links render as accessible icon links in the global footer only when Backstage provides a valid HTTPS URL. A platform name without a URL is omitted rather than shown as a nonfunctional link.

Published Backstage alerts render only when their schedule and route targeting match the current page. Banners appear above the site header; pop-ups use an accessible dialog and honor the center or bottom-right position. Alert publication, schedule, and route visibility are evaluated at build time, so changes appear with the next build/deploy. On small screens, the first navigation item styled as a button becomes the persistent action; the website CTA is used only when no navigation button exists.

Configure the website for **Headless** rendering in Backstage Settings. Backstage's canonical website route graph controls which CMS-backed routes are generated; Astro owns the route templates and renderers. Pages are matched by their `pathname`, so nested pages and future CMS pages are included without duplicating the route list in the app. Pages outside the graph are not published. Routable blueprint index and entry routes are resolved at build time through the SDK and rendered with a generic field renderer; canonical paths come from Backstage, and collection links only include entries present in the public route graph. The starter renders generated Events, Location, Menu, and Press routes only when their canonical paths are present in the route graph; missing records stay unhandled rather than leaking unlisted content. Do not enable the legacy **Application owned** routing mode as a Starter prerequisite. For site-specific routes that are not represented in Backstage's graph, add paths to `applicationRoutePaths` in `src/site/routes.ts` and implement Astro page files. Duplicate paths are rejected except where Backstage exposes the Events index alongside a CMS page at `/events`; in that confirmed case, the generated system route owns the public path. Unhandled routes are reported during non-indexable builds and fail an indexable production build, preventing module routes from silently shipping as 404s.

Navigation is read from Backstage. If the account has exactly one navigation, the starter uses it. If there are multiple, set `BACKSTAGE_NAVIGATION_ID` to select one. With no saved navigation, the site shows no page links; create a curated navigation in Backstage before launch. The setup check reports this as an incomplete prerequisite.

## Multi-location restaurant sites

Follow the [standard restaurant launch runbook](RESTAURANT_LAUNCH.md) to set up a shared-template site without changing source files. Set `BACKSTAGE_SITE_PROFILE=restaurant` in the site build and setup environment to opt into the restaurant page recipe, launch checks, and Backstage-managed design. The generic starter stays local-first when the variable is unset.

Use one Backstage website with multiple public Location records. Assign published menus to the appropriate locations and configure ordering, delivery, reservation and waitlist URLs on the location records. Location pages show their own menus, services, named weekly schedules and dated exceptions. Set location time zones for date-based hours. Public pages are static: changes and the removal of past exceptions are reflected on the next build.

Set **Settings → General → Footer → Location & Hours** in Backstage for a headless website. **Show** adds the branded section to the shared footer: full hours and a map or photo for one location, or a compact directory for multiple locations. **Hide** removes the automatic section, not Locations blocks. **Default** retains the previous single-location fallback. The site-wide footer skips published pages that already render an explicit Locations block or a generated location view.

The website resource exposes an optional `location_hours_footer` field (`show` or `hide`). Missing or unknown values use Default. The footer uses published location and menu routes, and a location-scoped menu footer uses that branch.

Set `SITE_LOCATION_CARD_DESCRIPTIONS=false` in a site's build environment to hide descriptions on directory and visit-panel cards while keeping the copy on individual location pages.

Use the Backstage Locations directory in navigation. With the restaurant profile and multiple routable locations, a generated brand-level `/menu/` opens the location chooser instead of choosing the first branch. Authored pages, application routes, location-owned aliases, and explicit menu links at that path keep their ownership. Existing `/menus-by-location/` links keep working. Add `/order-online/`, `/delivery/`, `/reservations/` or `/waitlist/` to Backstage navigation to link to a Starter chooser: it is built only when it does not replace an existing route and at least one public, routable location has that service. To send visitors straight to a provider for a single-location site, configure that URL in navigation. No provider accounts or API access are needed for these links.

The standard `/contact/` page lists existing location contact options alongside authored blocks. It does not enable or configure forms. Hero and location photos with dimensions from Backstage's public media CDN receive responsive WebP renditions at build time; images from other sources retain their original URLs.

For a synthetic, five-location preview, run:

```sh
BACKSTAGE_SOURCE=fixture BACKSTAGE_FIXTURE=multi-location BACKSTAGE_SITE_PROFILE=restaurant SITE_INDEXABLE=false npm run build
BACKSTAGE_SITE_PROFILE=restaurant node scripts/assert-multi-location-site.mjs preview
npm run preview
```

Omit `BACKSTAGE_FIXTURE` to use the normal single-location fixture.

## Blocks and layouts

Each built-in block lives in `src/blocks/<slug>/` with its `manifest.json` and Astro renderer together. The manifest is the block's Backstage editing contract; the explicit renderer map in `src/components/BlockRenderer.astro` connects its slug to local Astro code. An unregistered block or unsupported variant fails the build until its renderer is implemented. The shared site shell lives in `src/layouts/SiteLayout.astro` and is not a Backstage-assignable page layout.

Block manifests under `src/blocks/**/manifest.json` are recursively discovered for both Backstage sync and build validation. Application-defined blocks need a local semantic manifest and an explicit Astro renderer in `src/components/BlockRenderer.astro`; they do not need a PHP block class.

The starter includes Hero, Video Hero, Rich Text, Image, Image Gallery, Image Link Grid, Media with Text, Card Grid, Call to Action, Menu, Upcoming Events, Featured Event, Featured Press, Recent Press, Instagram Feed, and Contact Form blocks. Featured Event, Featured Press, and Recent Press select records with public routes at build time and hide when no eligible record exists. Mark items as featured in Backstage; the blocks reuse the record copy and media. Video Hero is a distinct background-video pattern with a poster image, reduced-motion handling, and an explicit play/pause control. Image Link Grid is for linked image tiles with accessible labels; use Image Gallery for unlinked images and Card Grid for items with visible text. Menu selects and renders canonical Backstage menu data. Call to Action and Hero support multiple action links. Image and card media use accessible alt text and responsive rendering; Image Gallery can show full images without cropping, and Card Grid supports optional links. The Contact Form block selects an existing Backstage form, reads its configured fields during the static build, and submits to Backstage's existing public form endpoint. It supports configured field types, file uploads, inline success/error messages, and reCAPTCHA v3 when the form definition includes a site key. Editorial blocks sanitize rich-text fields before rendering; do not pass CMS HTML directly to set:html.

Block schemas for Backstage's headless editor live beside the renderers in `src/blocks/<slug>/manifest.json`. The Starter owns these definitions; SDK 2.0 and later validate and sync them without a bundled catalog. Run `npm run setup` for a read-only account check and block-sync preview. After enabling CMS Custom Blocks, run `npm run setup -- --apply` with an account token that can manage blocks. Keep this token separate from the read-only build token. Sync checks identities and slugs and refuses to overwrite unregistered blocks; adopt one only after review with `npm run sync:blocks -- --adopt-unregistered=hero`. API builds verify that each used block matches its local manifest. For local Backstage certificates, set `NODE_OPTIONS=--use-system-ca` in the shell before starting setup or build. Do not disable TLS verification.

Run `npm run setup -- --readiness` for an explicit, read-only account readiness check. It exits nonzero for missing required setup, including an ambiguous website selection, disabled Custom Blocks, missing SDK contracts, block-sync drift, missing Home/root routes, invalid navigation selection, a Header Navigation whose usable links are all removed by the rendered route graph, contact-form blocks with invalid or unrenderable form definitions, unsupported or unsynced page blocks, and incompatible assigned layouts. Its output separates blockers from optional warnings and manual launch gates. The command does not write to Backstage and cannot verify the rendering mode, branding/SEO/content quality, contact-form recipients or delivery, or production hosting behavior; form recipient, reCAPTCHA/spam handling, and delivery remain manual checks, and a `READY` result is not launch approval. Do not combine `--readiness` with `--apply`, `--site`, or contact-form setup options.

Use `npm run --silent setup -- --readiness --json` in launch tooling. It writes one JSON object with `schemaVersion: 1`, `status` (`ready` or `blocked`), `websiteName`, `details`, `blockers`, `warnings`, and `manualGates`. A completed check exits 0 when ready or 1 when blocked; both return a report. Argument and setup errors are reported on stderr instead. Consume the report even on a nonzero exit and review the manual gates separately.

To create a generic site skeleton, first sync block definitions with `npm run setup -- --apply`. Then review the page plan with `npm run setup -- --site`; after checking it, use `npm run setup -- --site --apply` to create only missing Home and About pages. Page initialization refuses to run while block definitions need syncing. Existing pages are preserved. New pages are immediately part of the account's CMS route graph and may appear in the next site build; the API does not provide draft creation. This flow does not change website settings or navigation. Curate navigation links in Backstage after setup because the current API does not support writing navigation items. Branding, media, SEO metadata, and module-specific content remain manual.

The Contact page is optional and is created only when a configured form is selected. Verify its fields, recipient, reCAPTCHA, and spam settings in Backstage, then pass `--contact-form-id <id> --confirm-contact-form-recipient` to the setup command. The API can confirm that the form has fields but cannot verify recipient or delivery behavior; no test submission is sent by setup.

The Upcoming Events block reads events from Backstage at build time and requires the Engagement Events module. It renders only future or in-progress events, ordered by start time. Generated event detail pages are limited to event slugs in the public route graph. Menus can be routed from navigation relationships or canonical `/menu/{slug}` paths; the `/menu` index uses the public menu routes. Location pages render structured hours, directions, and a Google Maps embed only when the embed URL has the expected Google Maps origin and path.

### Legacy migration preview

`BACKSTAGE_PAGE_MODE=legacy-preview` is an optional, read-only compatibility tool for a deliberately selected test account that already contains legacy PHP blocks. It uses the regular Backstage website, route, navigation, menu, location, event, press, form, media, and Instagram APIs, then maps supported legacy block types to equivalent starter renderers. Unsupported types fail with the page and block name. Forms are displayed with disabled fields and cannot submit in this mode.

Legacy Preview is not the new-site setup or migration path. Do not use customer content or assets as starter data. New sites should use the default `headless` mode, sync the starter's account-block definitions, and create their own pages and content in Backstage. Legacy Preview is never a production publishing mode: it is API-only, rejects indexable output, does not change account settings, does not submit forms, and does not write to Backstage. Routes outside Backstage's canonical public route graph are not published.

Menu pages render the full category and placement model, including local menu-item overrides and multiple prices. Press index and detail pages are generated only for paths present in Backstage's public route list; unlisted Press records are excluded from the public output.

Each assignable layout lives in `src/layouts/<slug>/` with a `manifest.json` and Astro renderer. Its manifest uses the same envelope as block manifests (`manifest_version`, `type`, `name`, `slug`, and `schema.fields`) while keeping layout-specific fields in its schema. The manifest describes the Backstage editing contract; the explicit renderer map in `src/components/PageLayoutRenderer.astro` connects its slug to Astro code. `src/layouts/definitions.ts` imports layout manifests, supplies the definitions to runtime validation, and derives the default layout slug. Keep Astro routes under `src/pages` and the non-assignable site shell at `src/layouts/SiteLayout.astro`. The root `backstage.config.ts` provides the layout definitions and points block discovery to `src/blocks`; it is the SDK CLI configuration entry point. Run `npm run sync:layouts` with the account's CMS Custom Layouts module enabled and a token that can manage layouts. Assign a synced layout to a page in Backstage; Astro passes its data and page settings to the matching component. Pages without an assigned layout use the default Standard Page. API builds verify that Custom Layouts is enabled and the assigned layout's field schema matches the local manifest. An assigned layout without a matching component fails the build, so add the renderer before assigning a new layout slug.

## Design tokens

CSS custom properties are the canonical design-token source. `src/styles/global.css` wires the token files into Tailwind CSS v4 and imports only its theme and utility layers, preserving the starter's existing native styles. `src/styles/tokens/brand.css` defines portable identity slots and their local default colors/font stacks. Explicit declaration sync reads these defaults without modifying them; normal development and builds never mutate the file. Font asset loading remains site-owned.

`src/styles/tokens/theme.css` maps identity into site-owned semantic roles such as background, surface, foreground, muted, action, accent, and heading/body fonts. Use those semantic properties or Tailwind utilities such as `bg-action`, `text-foreground`, and `font-heading` in new presentation code. `src/styles/tokens/ui.css` is reserved for a small set of site-owned mechanics such as radius, spacing, container width, and page gutter. Do not add component-specific values there unless they are genuinely reused. Existing flat color/font variables are compatibility aliases; do not add new uses of them.

Brand tokens describe identity, not component appearance. Change `theme.css` for site-specific semantic choices, `ui.css` for shared interface mechanics, and component styles for one-off presentation. Do not add a UI library or a runtime Backstage theme request for token access.

Button-style actions share `--theme-radius-button` (default `6px`) through `--ui-radius-button`. Set it in `theme.css` to change the site's buttons together without changing the shape of cards, images, or form fields.

### Local or Backstage design

Choose design ownership in `backstage.config.ts`, independently of `BACKSTAGE_SOURCE`
and API credentials. The default is local, including when the setting is omitted:

```ts
export default defineConfig({
  designTokens: { source: "local" }, // change to "backstage" to pull Brand + Theme
  // Keep the existing block, layout, and themeTokens declarations here.
});
```

- **Local:** committed CSS controls Brand, Theme, and UI. Website design values are ignored, and theme-token sync (including dry runs) makes no requests. Backstage may still supply content. Local CSS is not constrained by Backstage's token declaration rules.
- **Backstage:** the build reads Brand palette/font-family values and saved Theme overrides from the website response already fetched for content. No additional request, account write, or CSS-file rewrite is performed. Invalid configuration fails clearly.
- `BACKSTAGE_SOURCE=fixture` remains entirely offline in both modes. Backstage design mode uses sample website design values from the fixture rather than real account data.

This switch controls design tokens, not content assets. Website logos/favicons and
page media continue to follow the selected content source.

The header uses the **Standard** logo size by default. Set
`SITE_HEADER_LOGO_SIZE=prominent` in the site's build environment and rebuild
for a taller mark and more room for wide logos. This changes only the header,
not the underlying logo or its aspect ratio. Use a tightly exported logo with
a transparent background and check contrast against the header color.

Brand mapping is limited to slots declared in `brand.css`. A palette token `primary`
maps to `--brand-color-primary`; custom tokens work the same way when a matching
slot exists. Tokenless legacy names are trimmed, lowercased, and spaces become
hyphens. Explicit tokens win over legacy names; the first valid duplicate wins.
Generated legacy colors such as `theme.colors.primary` are not Brand values and
are not imported. Supported colors are `#RGB` and `#RRGGBB`.

Font-family mappings named `display` and `body` map to `--brand-font-display` and
`--brand-font-body`. Other declared Brand font slots work by the same convention;
full `--brand-font-*` names are also accepted. Legacy `heading` maps to `display`
unless the site declares a separate heading slot. Font values must be ordinary
comma-separated family names, optionally quoted; CSS functions, declarations and
markup are rejected. Font URLs/downloads are not imported: load font assets in the
site, with fallback families in each stack.

The order is local CSS defaults, matching Backstage Brand values, then valid saved
Theme overrides. Missing/cleared/invalid remote values leave CSS in control. UI
mechanics are always site-owned, and unknown remote slots are ignored. A Brand
color therefore updates aliased Theme roles unless a Theme override replaces that
role. This is not a named-theme library or a universal token engine.

For a new account, set Headless rendering, enable CMS Custom Blocks, sync the manifests, then optionally create the generic site skeleton. Keep Backstage's canonical site graph as the source of public content routes; the Starter does not require the legacy Application owned routing mode. An API build with page blocks stops if Custom Blocks is disabled or a page references a block definition that has not been synced, because those blocks would not be editable in Backstage.

To use a Contact Form block, create and configure its fields in Backstage, sync the block manifest, then select the existing form in the block editor. Older forms without configured fields need field definitions before they can be rendered. The public reCAPTCHA site key is read from Backstage; register each production hostname with the matching reCAPTCHA configuration. The secret API token is only used during the build and is never sent to site visitors.

Form submissions are disabled in `astro dev`, Netlify Deploy Previews, and Netlify branch deploys. Preview forms show a notice, have disabled fields, and contain no action or form-specific submission wiring. Netlify production builds enable submissions. For a non-Netlify production build, set `BACKSTAGE_FORM_SUBMISSIONS_ENABLED=true`; it is false by default. This is a build-time setting, so rebuild after changing it. Do not enable the flag for a preview build.


### Backstage theme overrides

`backstage.theme-tokens.ts` derives the supported `--theme-color-*` declarations and
hex defaults from the existing brand/theme CSS. CSS remains the source of truth;
there is no second hand-maintained default palette. Only hex colors and `var(...)`
aliases resolving to hex can be registered as colors. The Starter also declares
Button Radius from `--theme-radius-button`. Its CSS default must be a whole-pixel
length from `0px` to `32px`, or `9999px` for Pill. Brand font-family values use the
existing website font mappings; font assets and `--ui-*` properties stay site-owned.

Managed Button Radius requires radius support in Backstage and SDK **2.1.0** or later. Set
`designTokens: { source: "backstage" }`, then register or preview supported Theme
tokens explicitly (local mode skips this step):

```bash
npm run sync:theme-tokens -- --dry-run
npm run sync:theme-tokens
```

Run the explicit sync with a Backstage account token that has website write access.
Builds can keep using a read-only token. Sync replaces declarations only and retains
saved editor values, including overrides for temporarily removed declarations.
It does not write `brand.css`, `theme.css`, or font assets. Before registering
Button Radius, upgrade every command runner that syncs this site's Theme Tokens.
Older SDKs reject radius declarations. The version 1 restaurant setup manifest
stays color-only; run the explicit sync after setup to register radius.

When upgrading from SDK 1.22, add the explicit Backstage source to retain managed
design and declaration sync. Existing account editor values are not deleted by
choosing local mode; they are simply not used.

Under Backstage Settings → Theme Tokens, editors can pick palette references or
custom hex colors, and choose Square, Soft, Pill, or a custom Button Radius.
Clearing a value restores the CSS default. The build reads `theme_tokens` from the website response it
already fetches, resolves palette tokens (or legacy palette names), and emits the
saved color and radius overrides on `<html>`. Missing, cleared, or invalid values and missing
palette colors leave the current CSS defaults in control; synced defaults are not
inlined. This preserves aliases such as topbar to background when only background
is changed. The build uses the same local CSS-derived declarations as sync and
ignores removed keys or remotely remapped CSS variables. The published SDK validates
the declaration contract. Sites without declarations keep their existing CSS
behavior. Brand, font, and interface properties cannot be overridden through this
color path, and no browser-side theme request is added. Declaration extraction
supports the committed `:root` color definitions and direct `var(...)` aliases,
not a selectable or conditional theme library.

A baked site's colors change on its next production rebuild. Configure the site's
opt-in Backstage build hook to rebuild after editor changes, or trigger its usual
production deployment manually.


## Search indexing

The default build is noindex and robots.txt disallows crawling. This is suitable for local previews and unpublished environments.

Netlify Deploy Previews and branch deploys use fixture content and stay noindex. Before enabling production deploys, configure BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, SITE_URL, and SITE_INDEXABLE=true in the production build environment. Keep secrets in Netlify's environment settings, not netlify.toml.

For a production build, set SITE_URL to the final HTTPS origin and SITE_INDEXABLE=true. This enables canonical and Open Graph URLs, an XML sitemap, and crawlable robots.txt. The build fails if indexing is enabled without an HTTPS URL. Do not enable indexing for preview deployments.

The shared layout includes page and site metadata, favicon and logo support, Open Graph and Twitter metadata, and generic Organization JSON-LD. Add a more specific schema type only when the site's actual business data supports it.

## Cloudflare Workers Static Assets

Wrangler serves the existing static `dist` output. The configuration uses Astro's folder-style routes, returns a native 404 for missing assets, and does not enable SPA fallback or include a Worker script. Change the generic `name` in `wrangler.jsonc` to a unique Worker name for the target account before deploying. No account ID, zone, route, or secret belongs in that file. Netlify remains configured for fixture-backed deploy previews.

Build a noindex preview from fixtures with submissions disabled, then run a local preview without Cloudflare login:

```sh
BACKSTAGE_SOURCE=fixture \
SITE_INDEXABLE=false \
BACKSTAGE_FORM_SUBMISSIONS_ENABLED=false \
npm run build
node scripts/assert-cloudflare-output.mjs
npx --yes wrangler@4.149.0 dev --local
```

For production, provide `BACKSTAGE_API_KEY`, `BACKSTAGE_ACCOUNT_ID`, and optional `BACKSTAGE_API_URL` only to the build process. In CI, expose them only to the Astro build step. Set the final HTTPS `SITE_URL`, enable indexing, and explicitly enable form submissions. Keep this in a separate CI step from Wrangler; the deploy step must not receive any `BACKSTAGE_*` values.

```sh
BACKSTAGE_SOURCE=api \
BACKSTAGE_API_KEY="$BACKSTAGE_API_KEY" \
BACKSTAGE_ACCOUNT_ID="$BACKSTAGE_ACCOUNT_ID" \
SITE_URL=https://www.example.com \
SITE_INDEXABLE=true \
BACKSTAGE_FORM_SUBMISSIONS_ENABLED=true \
npm run build
node scripts/assert-cloudflare-output.mjs
```

In a separate deploy step, expose only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the deployment provider's secret store, then run:

```sh
npx --yes wrangler@4.149.0 deploy
```

For an interactive local deploy, authenticate once with `npx --yes wrangler@4.149.0 login`. This starter does not configure a custom domain or DNS; configure that separately in the site's Cloudflare account.

## Accessibility baseline

The starter includes semantic header, navigation, main, and footer landmarks; a skip link; visible keyboard focus; responsive layouts; reduced-motion handling; and image alt text from Backstage media or the block's imageAlt field. This is a starting baseline, not an accessibility conformance certification. Review each site's content, contrast, interactions, and complete rendered routes before launch.

## Validation

- npm run check validates Astro and TypeScript contracts.
- npm run build runs the checker and creates the static site.
- CI builds both a noindex preview and an indexable site with sitemap output, then checks rendered route links, accessibility landmarks and image text, SEO directives, sitemap coverage, and that server credentials are absent from public assets.
- To run the rendered output checks locally after building, use `node scripts/assert-built-site.mjs preview` for the default noindex output or `node scripts/assert-built-site.mjs indexable` with the same `SITE_URL` and `SITE_INDEXABLE=true` values used for the production build.
- After a static build, `node scripts/assert-cloudflare-output.mjs` checks that the configured asset directory contains Astro's nested route output.

The Astro compiler requires Node.js 22.23.4 or newer. Keep the SDK and Astro versions updated through reviewed dependency changes, then run both production build modes.
