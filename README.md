# Backstage Headless Starter

A custom-site starting point using Astro and the framework-neutral Backstage SDK. Astro owns the route map, layouts, and block renderers. Backstage owns the editable content and media.

The site builds to static HTML. The SDK runs only during the build, so API credentials are not sent to visitors. A content change requires a new build and deploy; cache-only publishing is not implemented in this starter.

## Requirements

- Node.js 22.12 or newer
- An account configured for Headless rendering and Application owned routing in Backstage
- A read-only Backstage API key and account ID for API builds

## Local setup

Install dependencies with npm ci. Copy .env.example to .env and leave BACKSTAGE_SOURCE=fixture for the sample site. Start the dev server with npm run dev.

To build and preview the static site, run npm run build and then npm run preview. The sample fixture is also used in CI, so validation does not need Backstage credentials.

## Backstage content

Set BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, and optionally BACKSTAGE_API_URL to build from an account. The default API URL is https://bckstg.app/api. Keep the API key in the build environment's secret store; never add it to client-side code or a public-prefixed environment variable.

The starter reads the generic Websites, Pages, route graph, and Navigation APIs through @antlur/backstage. It does not use Frontstage endpoints. For now, an account must have exactly one website because the SDK Pages method does not yet filter pages by website. Page blocks must use the Headless shape with id, type, optional variant, and fields. A mismatch stops the build with an actionable error rather than silently dropping content.

For this starter, configure the website as **Headless application** with **Application owned** routing in Backstage Settings > Rendering. Backstage's canonical website route graph controls which CMS pages are generated. Pages are matched by their `pathname`, so nested pages and future CMS pages are included without duplicating the route list in the app. Pages outside the graph are not published. Routes that are not CMS pages belong to Astro; add their paths to `applicationRoutePaths` in `src/site/routes.ts` and implement them as Astro page files. Managed or Hybrid routing may also expose module routes (such as Events or Press); implement and register those in Astro before indexing the site. Duplicate paths are rejected. Unhandled Backstage routes are reported during non-indexable builds and fail an indexable production build, preventing module routes from silently shipping as 404s.

Navigation is read from Backstage. If the account has exactly one navigation, the starter uses it. If there are multiple, set `BACKSTAGE_NAVIGATION_ID` to select one. With no saved navigation, links are derived from the public CMS pages.

## Blocks and layouts

There is one Astro component per block in src/blocks and one shared site layout in src/layouts/SiteLayout.astro. Register each block in src/components/BlockRenderer.astro. An unregistered block or unsupported variant fails the build until its renderer is implemented.

Hero, Rich Text, and Contact Form are working block examples. Hero supports default and full-bleed-image variants. The Contact Form block selects an existing Backstage form, reads its configured fields during the static build, and submits to Backstage's existing public form endpoint. It supports configured field types, file uploads, inline success/error messages, and reCAPTCHA v3 when the form definition includes a site key. Editorial blocks sanitize rich-text fields before rendering; do not pass CMS HTML directly to set:html.

Block schemas for Backstage's headless editor live in blocks/<slug>/manifest.json. After enabling the CMS Custom Blocks module for the account, run npm run sync:blocks using an account token that can manage blocks. Keep this write-capable token separate from the read-only token used by API builds. The sync script checks that the module is enabled before creating or updating account-scoped definitions. If a same-slug block exists without a registry identity, sync refuses to overwrite it by default; adopt it only after review with npm run sync:blocks -- --adopt-unregistered=hero. API builds verify that Custom Blocks is enabled and that every used block matches its starter identity and schema; this prevents publishing pages that render but cannot be fully edited in Backstage. npm test checks that block manifests stay aligned with the starter's renderers and that build readiness catches missing or stale setup. For local Backstage certificates, run commands that call Backstage with NODE_OPTIONS=--use-system-ca, for example NODE_OPTIONS=--use-system-ca npm run sync:blocks or NODE_OPTIONS=--use-system-ca npm run build. This makes Node trust locally installed system certificates while keeping TLS verification enabled. NODE_OPTIONS is read when Node starts, so set it in the shell or process manager, not in .env; do not disable TLS verification.

For a new account, set Headless rendering and Application owned routing, enable CMS Custom Blocks, then sync the manifests. An API build with page blocks stops if Custom Blocks is disabled or a page references a block definition that has not been synced, because those blocks would not be editable in Backstage.

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
