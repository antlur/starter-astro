import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPageBySlug, normalizePage, normalizeWebsite } from "../src/lib/backstage/content";
import { sanitizeRichText } from "../src/lib/sanitize-rich-text";

const heroManifest = JSON.parse(readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"));

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
