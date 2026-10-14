# New Site Quickstart

Use this flow for a new Backstage account and a new repository based on the canonical `antlur/starter-astro` template. It creates a small Home/About scaffold; branding and real business content remain yours to configure.

## 1. Prepare Backstage

- Create the account and its website.
- Set the website rendering mode to **Headless**.
- Enable **CMS Custom Blocks** for the account.
- Create a read-only API key for builds and keep a separate write-capable key for setup.

The Starter currently expects exactly one website in the account. Do not use an existing customer account for a setup test unless you intend to add pages there.

## 2. Configure the local project

Create a repository from the Starter template, install dependencies, and copy `.env.example` to `.env`:

```sh
npm ci
cp .env.example .env
```

Set these values in `.env`:

```dotenv
BACKSTAGE_SOURCE=api
BACKSTAGE_PAGE_MODE=headless
BACKSTAGE_API_URL=https://bckstg.app/api
BACKSTAGE_API_KEY=<read-only-api-key>
BACKSTAGE_ACCOUNT_ID=<account-id>
SITE_INDEXABLE=false
BACKSTAGE_FORM_SUBMISSIONS_ENABLED=false
```

Keep `.env` and API keys out of Git and client-side/public variables.

## 3. Check and sync the account

Run the read-only check first:

```sh
npm run setup -- --readiness
```

Resolve any reported blockers. To sync the Starter block definitions, temporarily provide the write-capable key as `BACKSTAGE_API_KEY` and run:

```sh
npm run setup -- --apply
```

Restore the read-only key for normal builds. Block sync writes block definitions only; it does not change pages, navigation, menus, or website settings.

## 4. Plan and create starter pages

Review the proposed Home/About pages before writing:

```sh
npm run setup -- --site
```

If the plan is correct, provide the write-capable key and apply it:

```sh
npm run setup -- --site --apply
```

Only missing Home and About pages are created; existing pages are preserved. Backstage's page-create API does not create drafts, so new pages enter the account's route graph. The setup does not create navigation items or change website settings.

## 5. Add the site's real content

In Backstage, curate navigation links for the pages you intend to publish, then add the site's branding, media, SEO metadata, and module-specific content. The Starter reads navigation from Backstage and builds only routes present in its public route graph.

For a contact page, first configure the form fields, recipient, reCAPTCHA, and spam handling in Backstage. Review the selected form and recipient before adding a Contact page. Setup cannot send a test submission or verify email delivery.

Preview the Contact page addition with:

```sh
npm run setup -- --site --contact-form-id FORM_ID --confirm-contact-form-recipient
```

After reviewing the plan, add `--apply` to create it.

## 6. Build a local preview

With `SITE_INDEXABLE=false` and form submissions disabled, build and preview the static output:

```sh
npm run build
npm run preview
```

Before production launch, use the final HTTPS domain for `SITE_URL`, enable indexing only for the production build, and verify canonical URLs, sitemap, `robots.txt`, 404 behavior, and any enabled form delivery. Complete a human keyboard, mobile, and accessibility review. Automated readiness does not replace these checks.
