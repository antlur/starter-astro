import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPageBlockDefinitions,
  getPageBySlug,
  normalizePage,
  normalizeWebsite,
} from "../src/lib/backstage/content";
import { attachBackstageForms, normalizeFormDefinition } from "../src/lib/backstage/forms";
import { sanitizeRichText } from "../src/lib/sanitize-rich-text";

const heroManifest = JSON.parse(readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"));
const richTextManifest = JSON.parse(readFileSync(new URL("../blocks/rich-text/manifest.json", import.meta.url), "utf8"));
const contactFormManifest = JSON.parse(readFileSync(new URL("../blocks/contact-form/manifest.json", import.meta.url), "utf8"));
const blockRendererSource = readFileSync(new URL("../src/components/BlockRenderer.astro", import.meta.url), "utf8");

test("Hero manifest exposes the fields used by its Astro renderer", () => {
  const fields = heroManifest.schema.fields;
  const fieldBySlug = Object.fromEntries(fields.map((field: { slug: string }) => [field.slug, field]));

  assert.deepEqual(Object.keys(fieldBySlug).sort(), [
    "actions",
    "body",
    "eyebrow",
    "heading",
    "image",
    "imageAlt",
    "variant",
  ]);
  assert.deepEqual(fieldBySlug.variant.options.map((option: { value: string }) => option.value), ["default", "full-bleed-image"]);
  assert.equal(fieldBySlug.variant.placeholder, "Default (automatic)");
  assert.deepEqual(fieldBySlug.actions.fields.map((field: { slug: string }) => field.slug), ["label", "href"]);
  assert.equal(heroManifest.derived_from, "backstage:hero@1");
});

test("Rich Text manifest exposes the fields used by its Astro renderer", () => {
  const fields = richTextManifest.schema.fields;

  assert.equal(richTextManifest.registry_identity, "starter-astro:rich-text@1");
  assert.deepEqual(fields.map((field: { slug: string }) => field.slug), ["eyebrow", "heading", "body"]);
  assert.equal(fields.find((field: { slug: string }) => field.slug === "body").type, "rich_text");
});

test("Contact Form manifest selects an existing Backstage form instead of defining fields", () => {
  const fields = contactFormManifest.schema.fields;
  const formField = fields.find((field: { slug: string }) => field.slug === "form_id");

  assert.equal(contactFormManifest.registry_identity, "starter-astro:contact-form@1");
  assert.equal(formField.type, "form_select");
  assert.equal(fields.some((field: { slug: string }) => field.slug === "fields"), false);
});

test("every block manifest has a registered Astro renderer", () => {
  const rendererKeys = new Set(
    Array.from(blockRendererSource.matchAll(/^\s*["']?([\w-]+)["']?\s*:/gm), (match) => match[1]),
  );

  for (const manifest of [heroManifest, richTextManifest, contactFormManifest]) {
    assert.ok(rendererKeys.has(manifest.slug), `Missing renderer for ${manifest.slug}`);
  }
});

test("accepts the Backstage Headless page and block response shape", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    is_home: true,
    meta: { title: "Home title", description: "Page description" },
    blocks: [{ id: "block-1", type: "hero", variant: "default", fields: { heading: "Welcome" } }],
  });

  assert.equal(page.is_home, true);
  assert.equal(page.meta?.title, "Home title");
  assert.deepEqual(page.blocks[0], {
    id: "block-1",
    type: "hero",
    variant: "default",
    fields: { heading: "Welcome" },
  });
});

test("rejects legacy rendered blocks with a rendering-mode hint", () => {
  assert.throws(
    () => normalizePage({
      id: "page-1",
      title: "Home",
      slug: "/",
      blocks: [{ id: "block-1", block: "hero", data: {} }],
    }),
    /Set the account rendering mode to Headless/,
  );
});

test("normalizes empty PHP-serialized Headless fields to an object", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "decorative-rule", variant: null, fields: [] }],
  });

  assert.deepEqual(page.blocks[0].fields, {});
});

test("requires Custom Blocks to be enabled before building pages with blocks", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });

  assert.throws(
    () => assertPageBlockDefinitions([page], false, []),
    /CMS Custom Blocks is disabled.*remain editable in Backstage/,
  );
});

test("requires a synced account definition for every Headless page block", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });

  assert.throws(
    () => assertPageBlockDefinitions([page], true, [{ slug: "rich-text" }]),
    /no synced Custom Block definition for: hero.*npm run sync:blocks/,
  );
});

test("requires a matching registry identity for the starter block", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });

  assert.throws(
    () => assertPageBlockDefinitions([page], true, [{ slug: "hero", registry_identity: null }]),
    /not registered to starter-astro:hero@1/,
  );
});

test("requires the account block schema to include every starter manifest field", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });

  assert.throws(
    () => assertPageBlockDefinitions([page], true, [{
      slug: "hero",
      registry_identity: "starter-astro:hero@1",
      schema: { fields: [{ slug: "heading" }] },
    }]),
    /missing fields from its starter manifest: variant, eyebrow, body, image, imageAlt, actions/,
  );
});

test("accepts pages when every used block has a synced account definition", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });

  assert.doesNotThrow(() => assertPageBlockDefinitions([page], true, [{
    slug: "hero",
    registry_identity: heroManifest.registry_identity,
    schema: { fields: heroManifest.schema.fields.map(({ slug }: { slug: string }) => ({ slug })) },
  }]));
});

test("normalizes the generic Backstage website response", () => {
  const site = normalizeWebsite({
    app_name: "Fieldwork",
    account: { id: "account-1", name: "Fieldwork Coffee" },
    meta: { title: "Fieldwork", description: "Coffee nearby" },
    open_graph: { title: "Fieldwork social title", image: "https://example.test/og.jpg" },
    favicon_url: "https://example.test/favicon.ico",
    logo: { url: "https://example.test/logo.svg", width: 180, height: 50 },
  });

  assert.equal(site.name, "Fieldwork Coffee");
  assert.equal(site.openGraph?.image, "https://example.test/og.jpg");
  assert.equal(site.logo?.width, 180);
});

test("normalizes Backstage form fields and compatible phone fields", () => {
  const form = normalizeFormDefinition({
    data: {
      id: "form-1",
      title: "Contact",
      action: "https://backstage.example.test/api/wa/forms/form-1",
      recaptcha_site_key: "public-site-key",
      fields: [
        { id: "field-1", name: null, label: "Email Address", type: "email", required: true, options: [] },
        { id: "field-2", name: "phone_number", label: "Phone", type: "phone", required: false, options: [] },
        { id: "field-3", name: "interest", label: "Interest", type: "select", required: true, options: ["General", { label: "Catering", value: "catering" }] },
      ],
    },
  }, "form-1");

  assert.equal(form.title, "Contact");
  assert.equal(form.recaptchaSiteKey, "public-site-key");
  assert.equal(form.fields[0].name, "email_address");
  assert.equal(form.fields[1].type, "tel");
  assert.deepEqual(form.fields[2].options, [
    { label: "General", value: "General" },
    { label: "Catering", value: "catering" },
  ]);
});

test("resolves each referenced Backstage form once and attaches it to contact blocks", async () => {
  const page = normalizePage({
    id: "page-1",
    title: "Contact",
    slug: "contact",
    blocks: [
      { id: "block-1", type: "contact-form", fields: { form_id: "form/one" } },
      { id: "block-2", type: "contact-form", fields: { form_id: "form/one" } },
    ],
  });
  const requests: string[] = [];
  const reader = {
    async get<T>(url: string): Promise<T> {
      requests.push(url);
      return {
        data: {
          id: "form/one",
          title: "Contact",
          action: "https://backstage.example.test/api/wa/forms/form-one",
          fields: [{ id: "name", label: "Name", type: "text", required: true, options: [] }],
        },
      } as T;
    },
  };

  const pages = await attachBackstageForms([page], reader);

  assert.deepEqual(requests, ["/forms/form%2Fone"]);
  assert.equal(pages[0].blocks[0].form?.title, "Contact");
  assert.equal(pages[0].blocks[1].form?.fields[0].name, "name");
});

test("fails clearly when a selected Backstage form has no configured fields", () => {
  assert.throws(
    () => normalizeFormDefinition({
      data: {
        id: "form-empty",
        title: "Legacy form",
        action: "https://backstage.example.test/api/wa/forms/form-empty",
        fields: [],
      },
    }, "form-empty"),
    /has no configured fields/,
  );
});

test("rejects a non-web form submission URL", () => {
  assert.throws(
    () => normalizeFormDefinition({
      data: {
        id: "form-unsafe",
        title: "Unsafe form",
        action: "javascript:alert(1)",
        fields: [{ id: "field-1", label: "Name", type: "text", required: false, options: [] }],
      },
    }, "form-unsafe"),
    /invalid submission URL/,
  );
});

test("requires Contact Form blocks to select an existing Backstage form", async () => {
  const page = normalizePage({
    id: "page-1",
    title: "Contact",
    slug: "contact",
    blocks: [{ id: "block-1", type: "contact-form", fields: {} }],
  });

  await assert.rejects(
    () => attachBackstageForms([page], { async get<T>() { return null as T; } }),
    /must select an existing Backstage form/,
  );
});

test("fails when a route slug maps to more than one page", () => {
  const page = normalizePage({ id: "one", title: "Page", slug: "about", blocks: [] });

  assert.throws(() => getPageBySlug([page, { ...page, id: "two" }], "about"), /found 2/);
});

test("sanitizes rich text tags and unsafe link schemes", () => {
  const html = sanitizeRichText(
    '<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a>',
  );

  assert.match(html, /<p>Hello<\/p>/);
  assert.match(html, /Unsafe link/);
  assert.doesNotMatch(html, /<script|javascript:/i);
});
