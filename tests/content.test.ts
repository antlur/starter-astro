import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPageBlockDefinitions,
  assertPageLayoutDefinitions,
  getPageBySlug,
  normalizeNavigation,
  normalizePage,
  normalizeWebsite,
} from "../src/lib/backstage/content";
import { attachBackstageForms, normalizeFormDefinition } from "../src/lib/backstage/forms";
import { sanitizeRichText } from "../src/lib/sanitize-rich-text";
import {
  defaultPageLayoutSlug,
  pageLayoutDefinitions,
  resolvePageLayoutSlug,
} from "../src/site/page-layout-definitions";

const heroManifest = JSON.parse(readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"));
const richTextManifest = JSON.parse(readFileSync(new URL("../blocks/rich-text/manifest.json", import.meta.url), "utf8"));
const contactFormManifest = JSON.parse(readFileSync(new URL("../blocks/contact-form/manifest.json", import.meta.url), "utf8"));
const blockRendererSource = readFileSync(new URL("../src/components/BlockRenderer.astro", import.meta.url), "utf8");
const pageLayoutRendererSource = readFileSync(new URL("../src/components/PageLayoutRenderer.astro", import.meta.url), "utf8");
const localLayoutFields = () => pageLayoutDefinitions[0].schema.fields.map(({ slug, type, options }) => ({
  slug,
  type,
  options,
}));

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

test("every configured Backstage page layout has an Astro renderer", () => {
  const rendererSlugs = Array.from(
    pageLayoutRendererSource.matchAll(/^\s*["']?([\w-]+)["']?\s*:\s*\w+,$/gm),
    (match) => match[1],
  );

  assert.deepEqual(rendererSlugs.sort(), pageLayoutDefinitions.map(({ slug }) => slug).sort());
  assert.equal(defaultPageLayoutSlug, "starter-astro-standard-page");
  assert.deepEqual(pageLayoutDefinitions[0].schema.fields.map(({ slug }) => slug), [
    "content_width",
    "section_spacing",
  ]);
});

test("uses the default page layout when none is assigned and rejects unknown layouts", () => {
  assert.equal(resolvePageLayoutSlug(null, [defaultPageLayoutSlug]), defaultPageLayoutSlug);
  assert.throws(
    () => resolvePageLayoutSlug("unregistered-layout", [defaultPageLayoutSlug]),
    /has no Astro renderer/,
  );
});

test("accepts the Backstage Headless page and block response shape", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
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

test("preserves page settings and assigned layout data from Backstage", () => {
  const page = normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about",
    settings: { color_scheme: "dark" },
    layout: {
      id: "layout-1",
      name: "Starter Astro Standard Page",
      slug: "starter-astro-standard-page",
      schema: { fields: [] },
      data: { content_width: "narrow", section_spacing: "spacious" },
    },
    blocks: [],
  });

  assert.deepEqual(page.settings, { color_scheme: "dark" });
  assert.equal(page.layout?.slug, "starter-astro-standard-page");
  assert.deepEqual(page.layout?.data, { content_width: "narrow", section_spacing: "spacious" });
});

test("rejects malformed assigned page layout data", () => {
  assert.throws(
    () => normalizePage({
      id: "page-1",
      title: "About",
      slug: "about",
      pathname: "/about",
      layout: {
        id: "layout-1",
        name: "Standard Page",
        slug: defaultPageLayoutSlug,
        schema: { fields: [] },
        data: ["invalid"],
      },
      blocks: [],
    }),
    /layout data must be object-shaped/,
  );
});

test("requires Custom Layouts when Backstage pages assign a page layout", () => {
  const page = normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about",
    layout: {
      id: "layout-1",
      name: "Starter Astro Standard Page",
      slug: "starter-astro-standard-page",
      schema: { fields: [] },
      data: {},
    },
    blocks: [],
  });

  assert.throws(
    () => assertPageLayoutDefinitions([page], false),
    /CMS Custom Layouts is disabled.*remain editable in Backstage/,
  );
});

test("requires assigned Backstage layouts to match the local definition and field schema", () => {
  const page = normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about",
    layout: {
      id: "layout-1",
      name: "Starter Astro Standard Page",
      slug: "starter-astro-standard-page",
      schema: { fields: [{ slug: "content_width" }] },
      data: {},
    },
    blocks: [],
  });

  assert.throws(
    () => assertPageLayoutDefinitions([page], true),
    /missing fields from its local definition: section_spacing.*npm run sync:layouts/,
  );

  const unknownLayoutPage = normalizePage({
    id: "page-2",
    title: "Campaign",
    slug: "campaign",
    pathname: "/campaign",
    layout: {
      id: "layout-2",
      name: "Campaign",
      slug: "campaign",
      schema: { fields: [] },
      data: {},
    },
    blocks: [],
  });

  assert.throws(
    () => assertPageLayoutDefinitions([unknownLayoutPage], true),
    /has no matching definition and Astro renderer/,
  );

  const unsupportedLayoutPage = normalizePage({
    id: "page-3",
    title: "Campaign",
    slug: "campaign",
    pathname: "/campaign",
    layout: {
      id: "layout-3",
      name: "Starter Astro Standard Page",
      slug: defaultPageLayoutSlug,
      schema: {
        fields: [
          ...localLayoutFields(),
          { slug: "hero_alignment" },
        ],
      },
      data: {},
    },
    blocks: [],
  });

  assert.throws(
    () => assertPageLayoutDefinitions([unsupportedLayoutPage], true),
    /fields not supported by its local Astro renderer: hero_alignment.*Update the local layout definition and renderer/,
  );
});

test("accepts an assigned layout whose Backstage fields match the local definition", () => {
  const page = normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about",
    layout: {
      id: "layout-1",
      name: "Starter Astro Standard Page",
      slug: defaultPageLayoutSlug,
      schema: { fields: localLayoutFields() },
      data: { content_width: "narrow", section_spacing: "comfortable" },
    },
    blocks: [],
  });

  assert.doesNotThrow(() => assertPageLayoutDefinitions([page], true));
});

test("rejects assigned layouts whose field types or select values differ from the local renderer", () => {
  const makePage = (fields: unknown[]) => normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about",
    layout: {
      id: "layout-1",
      name: "Starter Astro Standard Page",
      slug: defaultPageLayoutSlug,
      schema: { fields },
      data: {},
    },
    blocks: [],
  });

  const wrongType = localLayoutFields().map((field) =>
    field.slug === "content_width" ? { ...field, type: "text" } : field,
  );
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongType)], true),
    /field "content_width" has type "text"; the local Astro renderer expects "select"/,
  );

  const wrongOptions = localLayoutFields().map((field) =>
    field.slug === "content_width"
      ? { ...field, options: field.options?.filter(({ value }) => value !== "wide") }
      : field,
  );
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongOptions)], true),
    /field "content_width" has options that differ from its local Astro definition/,
  );
});

test("rejects legacy rendered blocks with a rendering-mode hint", () => {
  assert.throws(
    () => normalizePage({
      id: "page-1",
      title: "Home",
      slug: "/",
      pathname: "/",
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
    pathname: "/",
    blocks: [{ id: "block-1", type: "decorative-rule", variant: null, fields: [] }],
  });

  assert.deepEqual(page.blocks[0].fields, {});
});

test("requires Custom Blocks to be enabled before building pages with blocks", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
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
    pathname: "/",
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
    pathname: "/",
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
    pathname: "/",
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
    pathname: "/",
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
    pathname: "/contact",
    blocks: [
      { id: "block-1", type: "contact-form", fields: { form_id: "form/one" } },
      { id: "block-2", type: "contact-form", fields: { form_id: "form/one" } },
    ],
  });
  const requests: string[] = [];
  const reader = {
    forms: {
      async getFormDefinition(formId: string) {
        requests.push(formId);
        return {
          id: "form/one",
          title: "Contact",
          type: "contact",
          action: "https://backstage.example.test/api/wa/forms/form-one",
          redirect_url: null,
          recaptcha_site_key: null,
          fields: [{ id: "name", name: null, label: "Name", type: "text", required: true, options: [], order: 0 }],
        };
      },
    },
  };

  const pages = await attachBackstageForms([page], reader);

  assert.deepEqual(requests, ["form/one"]);
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
    pathname: "/contact",
    blocks: [{ id: "block-1", type: "contact-form", fields: {} }],
  });

  await assert.rejects(
    () => attachBackstageForms([page], { forms: { async getFormDefinition() { throw new Error("Unexpected form read"); } } }),
    /must select an existing Backstage form/,
  );
});

test("fails when a route slug maps to more than one page", () => {
  const page = normalizePage({ id: "one", title: "Page", slug: "about", pathname: "/about", blocks: [] });

  assert.throws(() => getPageBySlug([page, { ...page, id: "two" }], "about"), /found 2/);
});

test("normalizes Backstage navigation and rejects unsafe link schemes", () => {
  const navigation = normalizeNavigation({
    items: [{
      id: "menu-1",
      text: "Menus",
      url: "/menus",
      new_window: false,
      children: [{ id: "menu-2", text: "Dinner", url: "/menus/dinner", new_window: true }],
    }],
  });

  assert.deepEqual(navigation, [{
    id: "menu-1",
    text: "Menus",
    url: "/menus/",
    newWindow: false,
    children: [{ id: "menu-2", text: "Dinner", url: "/menus/dinner/", newWindow: true, children: [] }],
  }]);

  assert.throws(
    () => normalizeNavigation({ items: [{ id: "unsafe", text: "Unsafe", url: "javascript:alert(1)" }] }),
    /unsupported URL/,
  );
});

test("sanitizes rich text tags and unsafe link schemes", () => {
  const html = sanitizeRichText(
    '<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a>',
  );

  assert.match(html, /<p>Hello<\/p>/);
  assert.match(html, /Unsafe link/);
  assert.doesNotMatch(html, /<script|javascript:/i);
});
