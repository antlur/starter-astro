# Backstage Headless Starter

A custom-site starting point using Astro and the framework-neutral Backstage SDK. Astro owns the route map, layouts, and block renderers. Backstage owns the editable content and media.

The site builds to static HTML. The SDK runs only during the build, so API credentials are not sent to visitors. A content change requires a new build and deploy; cache-only publishing is not implemented in this starter.

## Requirements

- Node.js 22.12 or newer
- An account configured for Headless rendering in Backstage
- A read-only Backstage API key and account ID for API builds

## Local setup

Install dependencies with npm ci. Copy .env.example to .env and leave BACKSTAGE_SOURCE=fixture for the sample site. Start the dev server with npm run dev.

To build and preview the static site, run npm run build and then npm run preview. The sample fixture is also used in CI, so validation does not need Backstage credentials.

## Backstage content

Set BACKSTAGE_SOURCE=api, BACKSTAGE_API_KEY, BACKSTAGE_ACCOUNT_ID, and optionally BACKSTAGE_API_URL to build from an account. The default API URL is https://bckstg.app/api. Keep the API key in the build environment's secret store; never add it to client-side code or a public-prefixed environment variable.

The starter reads the generic Websites and Pages endpoints through @antlur/backstage. It does not use Frontstage endpoints. For now, an account must have exactly one website because the SDK Pages method does not yet filter pages by website. Page blocks must use the Headless shape with id, type, optional variant, and fields. A mismatch stops the build with an actionable error rather than silently dropping content.

The CMS is not the route registry. Add each public path and its Backstage page slug to src/site/routes.ts. Only those routes are generated; this keeps application-owned routing explicit and prevents unreviewed CMS pages from becoming public automatically. Add matching links in src/site/navigation.ts.

## Blocks and layouts

There is one Astro component per block in src/blocks and one shared site layout in src/layouts/SiteLayout.astro. Register each block in src/components/BlockRenderer.astro. An unregistered block or unsupported variant fails the build until its renderer is implemented.

The Hero block is a working example with default and full-bleed-image variants. Its rich-text body is sanitized before rendering. Use the same approach for other HTML fields; do not pass CMS HTML directly to set:html.

## Search indexing

The default build is noindex and robots.txt disallows crawling. This is suitable for local previews and unpublished environments.

For a production build, set SITE_URL to the final HTTPS origin and SITE_INDEXABLE=true. This enables canonical and Open Graph URLs, an XML sitemap, and crawlable robots.txt. The build fails if indexing is enabled without an HTTPS URL. Do not enable indexing for preview deployments.

The shared layout includes page and site metadata, favicon and logo support, Open Graph and Twitter metadata, and generic Organization JSON-LD. Add a more specific schema type only when the site's actual business data supports it.

## Accessibility baseline

The starter includes semantic header, navigation, main, and footer landmarks; a skip link; visible keyboard focus; responsive layouts; reduced-motion handling; and image alt text from Backstage media or the block's imageAlt field. This is a starting baseline, not an accessibility conformance certification. Review each site's content, contrast, interactions, and complete rendered routes before launch.

## Validation

- npm run check validates Astro and TypeScript contracts.
- npm run build runs the checker and creates the static site.
- CI builds both a noindex preview and an indexable site with sitemap output.

The Astro compiler requires Node.js 22.12 or newer. Keep the SDK and Astro versions updated through reviewed dependency changes, then run both production build modes.
