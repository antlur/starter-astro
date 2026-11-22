# Standard Restaurant Launch

Use one revision of the shared Astro starter for standard sites. Each restaurant has a separate Backstage account, website, build environment, and deploy target. A multi-location restaurant uses multiple Location records under that website. This workflow needs no changes to the starter repository or CSS.

## Before Starting the Clock

Have approval to use the deployment target and final domain, plus a site name, logo/favicon, palette, rights-cleared images and copy, location names and contact details, local hours and holiday dates, published menus or accessible PDFs, external service links by location, and a verified form recipient or public contact channel. Identify the person who can approve the preview. DNS propagation, third-party account approval, content creation, and legacy migrations are outside the one-business-day target.

For a rehearsal use an isolated account or local Backstage instance, a noindex build, and disabled form submissions. Noindex is not access control; use restricted staging for private content. Never assume saving in an existing account is safe: check existing deployment/rebuild hooks before writing.

## 1. Prepare the Account

1. Have a platform admin choose **Headless** and **Managed** routing in **Rendering and Routing**. Enable **CMS Custom Blocks** and **Restaurant Menus**, and configure the website identity. Use one website in the account. Do not change routing on an existing site without a separate URL migration review.
2. Under **Locations**, create each public branch. Add its address, directions, phone or email, time zone, named hours and special hours. Add ordering, delivery, reservation or waitlist links only where available.
3. Under **Menus**, create or verify published menus, then assign them to the appropriate branches in the intended order. A menu may be shared; never copy a location-specific menu to another branch just to fill a gap. Use **Pages → Routes** (or the account's route list) to verify Location and Menu paths. Leave generated routes owned by their source records.
4. For Contact, configure an existing **Backstage Form** with approved fields, recipient, and spam protection. If not using a form, put a real email/phone or an explicit link to the location directory on the Contact page. For other inquiry pages use the same form block or a valid external link, not a hardcoded form.

## 2. Connect the Shared Template

Set deployment environment values, not source files:

```dotenv
BACKSTAGE_SOURCE=api
BACKSTAGE_PAGE_MODE=headless
BACKSTAGE_SITE_PROFILE=restaurant
BACKSTAGE_API_KEY=<read-only-account-key>
BACKSTAGE_ACCOUNT_ID=<account-id>
SITE_INDEXABLE=false
BACKSTAGE_FORM_SUBMISSIONS_ENABLED=false
```

Use a separate write-capable account key for the following explicit setup operations. Keep both keys outside version control and use only the read key for builds:

```sh
npm run setup
npm run setup -- --apply
npm run sync:theme-tokens -- --dry-run
npm run sync:theme-tokens
npm run setup -- --site
```

Optionally bind the approved Contact form when planning: `npm run setup -- --site --contact-form-id FORM_ID --confirm-contact-form-recipient`. After reviewing the plan, rerun the exact command with `--apply`. The restaurant recipe only creates missing Home, About, and Contact pages. It does not overwrite existing pages, invent media, or create duplicate Menu/Location pages. New pages are not drafts; review the account isolation first.

Backstage may already have created a blank Home and a legacy Contact placeholder during account creation. Setup deliberately preserves them. In the editor add **Hero**, **Media With Text**, and **Call to Action** to Home. On Contact, replace the legacy form block with **Contact Form** and select the configured form, or add verified contact links in **Rich Text**. About uses **Hero** and **Rich Text**. Use the existing pages rather than deleting and recreating them.

## 3. Finish in Backstage

- **Pages:** edit the seeded page copy, homepage hero content and images, actions, and SEO. Replace all starter content. Add or remove optional sections using the existing blocks. A form must use an existing configured form ID.
- **Branding and Theme Tokens:** set the logo, favicon and supported Brand palette/font slots; choose semantic theme values if needed. Test contrast for buttons, header, footer, and focus. Assets/fonts outside the template's supported setup are custom work.
- **Navigation:** choose the website's Header Navigation and enter Home, Menu, Locations (or Visit for a single location), About, and Contact. Link to the actual published paths; do not create CMS pages solely to own generated paths. On multi-location sites, readiness prints the branch menu chooser: typically `/menu/`, or `/menus-by-location/` when Backstage already owns `/menu/`. If an intentional CMS menu is in use, check that guests can still find their branch's menus. Add `/order-online/`, `/delivery/`, `/reservations/`, or `/waitlist/` only when configured and available; the built site omits unavailable service chooser links.

## 4. Rehearse, Verify, Publish

Use the same catalog for different homepage compositions. For a promotion-led restaurant, start with a full-bleed Hero, use the Lead Feature layout in Card Grid for the offer you want guests to see first, then add a Compact Locations list. For a location-led restaurant, start with a Compact Hero and put Locations immediately below it; use Photo Grid when each branch has useful photography. Edge to Edge in Media With Text gives a story or visit section a full-width split, with an optional Inverse tone drawn from the site's existing tokens.

The Locations block reads published locations, canonical menu paths, and available branch service links from the same source as generated routes. Edit addresses, hours, and provider links on the location record rather than copying them into Home. A block does not create routes, and it stays hidden when there are no public locations.

On an existing site, preview and sync the block definitions before selecting the new layouts in Backstage. Previously saved sections keep their original presentation.

1. Record start time and elapsed operator time per phase. Run `npm run setup -- --readiness` in restaurant mode, then build using the read-only key and preview with forms disabled. A passing check confirms only what it reports.
2. Open the five main destinations. Verify branch menus and labels, weekday/holiday hours, branch-specific provider links, and no stub or unpublished locations on desktop and mobile. Check keyboard/screen-reader navigation, contrast, forms and error states, redirects, canonicals, sitemap, and robots.
3. On an approved test target confirm real email delivery to the agreed recipient, and verify save → queue → one rebuild plus rollback to the last good deploy. Do not enable submissions or indexing on an unapproved preview.
4. After approval, use the final HTTPS origin for `SITE_URL`, enable production indexing and form submission as appropriate, and verify the actual domain. Record the released template revision, approval, timing, and remaining gaps. Existing customer settings and deployments are outside the rehearsal.

Custom sites can clone the same release, leave the profile unset or keep its managed design, then replace a renderer or add a site-specific block without changing these contracts.
