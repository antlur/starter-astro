import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Field } from "@antlur/backstage";
import {
  assertPageBlockDefinitions,
  assertPageLayoutDefinitions,
  attachEventsToBlocks,
  attachMenusToBlocks,
  getPageBySlug,
  normalizeNavigation,
  normalizePage,
  normalizeWebsite,
} from "../src/lib/backstage/content";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import type { BlockManifest } from "../src/lib/backstage/sync-blocks";
import { attachBackstageForms, normalizeFormDefinition } from "../src/lib/backstage/forms";
import { sanitizeRichText } from "../src/lib/sanitize-rich-text";
import {
  defaultPageLayoutSlug,
  pageLayoutDefinitions,
  resolvePageLayoutSlug,
} from "../src/site/page-layout-definitions";

const blockManifests = loadBlockManifests();
const blockManifest = (slug: string): BlockManifest => {
  const manifest = blockManifests.find((candidate) => candidate.slug === slug);
  if (!manifest) throw new Error(`Missing test block manifest: ${slug}`);
  return manifest;
};
const heroManifest = blockManifest("hero");
const richTextManifest = blockManifest("rich-text");
const contactFormManifest = blockManifest("contact-form");
const imageManifest = blockManifest("image");
const cardGridManifest = blockManifest("card-grid");
const callToActionManifest = blockManifest("call-to-action");
const mediaWithTextManifest = blockManifest("media-with-text");
const imageGalleryManifest = blockManifest("image-gallery");
const upcomingEventsManifest = blockManifest("upcoming-events");
const instagramFeedManifest = blockManifest("instagram-feed");
const blockRendererSource = readFileSync(new URL("../src/components/BlockRenderer.astro", import.meta.url), "utf8");
const pageLayoutRendererSource = readFileSync(new URL("../src/components/PageLayoutRenderer.astro", import.meta.url), "utf8");
const localLayoutFields = () => pageLayoutDefinitions[0].schema.fields.map(({ slug, type, options }) => ({
  slug,
  type,
  options,
}));

test("Hero manifest exposes the fields used by its Astro renderer", () => {
  const fields = heroManifest.schema.fields;
  const fieldBySlug = new Map(fields.map((field) => [field.slug, field]));

  assert.deepEqual([...fieldBySlug.keys()].sort(), [
    "actions",
    "body",
    "eyebrow",
    "heading",
    "image",
    "imageAlt",
    "logo",
    "logoAlt",
    "variant",
  ]);
  const variant = fieldBySlug.get("variant");
  const actions = fieldBySlug.get("actions");
  assert.ok(variant);
  assert.ok(actions);
  assert.deepEqual(variant.options?.map((option) => option.value), ["default", "full-bleed-image"]);
  assert.equal(variant.placeholder, "Default (automatic)");
  assert.equal(fieldBySlug.get("image")?.type, "image_list");
  assert.equal(fieldBySlug.get("logo")?.type, "image");
  assert.deepEqual(actions.fields?.map((field) => field.slug), ["label", "href"]);
  assert.equal(heroManifest.derived_from, "backstage:hero@1");
});

test("starter block identities align with the SDK registry namespace", () => {
  const canonicalIdentities = new Set([
    "starter-astro:call-to-action@1",
    "starter-astro:card-grid@1",
    "starter-astro:contact-form@1",
    "starter-astro:hero@1",
    "starter-astro:image-gallery@1",
    "starter-astro:image@1",
    "starter-astro:instagram-feed@1",
    "starter-astro:media-with-text@1",
    "starter-astro:menu@1",
    "starter-astro:rich-text@1",
    "starter-astro:upcoming-events@1",
  ]);

  assert.equal(blockManifests.length, canonicalIdentities.size);
  assert.deepEqual(new Set(blockManifests.map((manifest) => manifest.registry_identity)), canonicalIdentities);
  assert.equal(heroManifest.derived_from, "backstage:hero@1");
  assert.ok(blockManifests.filter((manifest) => manifest.slug !== "hero").every((manifest) => manifest.derived_from === undefined));
});

test("Rich Text manifest exposes the fields used by its Astro renderer", () => {
  const fields = richTextManifest.schema.fields;

  assert.equal(richTextManifest.registry_identity, "starter-astro:rich-text@1");
  assert.deepEqual(fields.map((field: { slug: string }) => field.slug), ["eyebrow", "heading", "body"]);
  const body = fields.find((field) => field.slug === "body");
  assert.ok(body);
  assert.equal(body.type, "rich_text");
});

test("Contact Form manifest selects an existing Backstage form instead of defining fields", () => {
  const fields = contactFormManifest.schema.fields;
  const formField = fields.find((field) => field.slug === "form_id");

  assert.ok(formField);
  assert.equal(contactFormManifest.registry_identity, "starter-astro:contact-form@1");
  assert.equal(formField.type, "form_select");
  assert.equal(formField.required, true);
  assert.equal(fields.some((field: { slug: string }) => field.slug === "fields"), false);
});

test("common content manifests expose their renderer fields", () => {
  assert.deepEqual(imageManifest.schema.fields.map((field) => field.slug), ["image", "imageAlt", "caption"]);
  assert.equal(imageManifest.registry_identity, "starter-astro:image@1");

  const cards = cardGridManifest.schema.fields.find((field) => field.slug === "cards");
  assert.ok(cards);
  assert.deepEqual(cards.fields?.map((field) => field.slug), [
    "image",
    "imageAlt",
    "title",
    "body",
    "link_label",
    "link_url",
  ]);

  assert.deepEqual(callToActionManifest.schema.fields.map((field) => field.slug), [
    "eyebrow",
    "heading",
    "body",
    "button_label",
    "button_url",
    "actions",
  ]);
  assert.deepEqual(callToActionManifest.schema.fields.find((field) => field.slug === "actions")?.fields?.map((field) => field.slug), ["label", "href"]);
});

test("media with text and image gallery cover reusable editorial layouts", () => {
  assert.deepEqual(mediaWithTextManifest.schema.fields.map((field) => field.slug), [
    "eyebrow",
    "heading",
    "subheading",
    "body",
    "image",
    "imageAlt",
    "image_position",
    "section_width",
    "cta_label",
    "cta_url",
  ]);
  assert.deepEqual(
    mediaWithTextManifest.schema.fields.find((field) => field.slug === "image_position")?.options?.map((option) => option.value),
    ["left", "right"],
  );

  const images = imageGalleryManifest.schema.fields.find((field) => field.slug === "images");
  assert.ok(images);
  assert.deepEqual(images.fields?.map((field) => field.slug), ["image", "imageAlt", "caption"]);
  assert.deepEqual(imageGalleryManifest.schema.fields.find((field) => field.slug === "columns")?.options?.map((option) => option.value), ["2", "3", "4"]);
  assert.deepEqual(imageGalleryManifest.schema.fields.find((field) => field.slug === "image_fit")?.options?.map((option) => option.value), ["cover", "contain"]);
});

test("upcoming events block uses a small editable schema backed by the Events module", () => {
  assert.deepEqual(upcomingEventsManifest.schema.fields.map((field) => field.slug), [
    "eyebrow",
    "title",
    "description",
    "count",
    "view_all_label",
  ]);
  assert.equal(upcomingEventsManifest.schema.fields.find((field) => field.slug === "description")?.type, "rich_text");
  assert.equal(upcomingEventsManifest.schema.fields.find((field) => field.slug === "view_all_label")?.placeholder, "View all events");
});

test("Menu block selects canonical Backstage menu data", () => {
  assert.equal(blockManifest("menu").registry_identity, "starter-astro:menu@1");
  assert.deepEqual(blockManifest("menu").schema.fields.map((field) => [field.slug, field.type]), [["menu_id", "menu_select"]]);
});

test("attaches selected menus to page blocks by canonical menu ID", () => {
  const page = normalizePage({
    id: "page-menu",
    title: "Dinner",
    slug: "dinner",
    pathname: "/dinner",
    blocks: [{ id: "block-menu", type: "menu", fields: { menu_id: { id: "menu-1", slug: "dinner" } } }],
  });
  const menu = { id: "menu-1", title: "Dinner", slug: "dinner", subtitle: null, pdfUrl: null, categories: [] };

  attachMenusToBlocks([page], [menu]);
  assert.equal(page.blocks[0].menu?.id, "menu-1");
  assert.throws(() => attachMenusToBlocks([page], []), /references menu menu-1 that was not loaded/);
  assert.throws(
    () => attachMenusToBlocks([normalizePage({
      id: "missing-menu-page",
      title: "Dinner",
      slug: "dinner",
      pathname: "/dinner",
      blocks: [{ id: "empty-menu", type: "menu", fields: {} }],
    })], []),
    /has no selected menu/,
  );
});

test("connects Upcoming Events blocks to the generated events index only when that route exists", () => {
  const page = normalizePage({
    id: "page-events",
    title: "Events",
    slug: "events",
    pathname: "/events",
    blocks: [{ id: "block-events", type: "upcoming-events", fields: {} }],
  });

  attachEventsToBlocks([page], [], ["/events"]);
  assert.equal(page.blocks[0].eventsIndexPath, "/events/");
  attachEventsToBlocks([page], [], []);
  assert.equal(page.blocks[0].eventsIndexPath, null);
});

test("Instagram Feed block uses connected public posts and a compact editable schema", () => {
  assert.deepEqual(instagramFeedManifest.schema.fields.map((field) => field.slug), ["eyebrow", "heading", "count"]);
  assert.equal(instagramFeedManifest.registry_identity, "starter-astro:instagram-feed@1");
});

test("every block manifest has a registered Astro renderer", () => {
  const rendererKeys = new Set(
    Array.from(blockRendererSource.matchAll(/^\s*["']?([\w-]+)["']?\s*:/gm), (match) => match[1]),
  );

  for (const manifest of blockManifests) {
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

test("requires a matching registry identity for the local block", () => {
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

test("requires the account block schema to include every local manifest field", () => {
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
      schema: { fields: [structuredClone(heroManifest.schema.fields.find(({ slug }) => slug === "heading")!)] },
    }]),
    /missing fields from its local manifest: variant, eyebrow, body, image, imageAlt, logo, logoAlt, actions/,
  );
});

test("rejects account block schemas that drift from the local field contract", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });
  const definition = (fields: readonly Field[]) => [{
    slug: "hero",
    registry_identity: heroManifest.registry_identity,
    schema: { fields },
  }];
  const matchingFields = (): Field[] => [...structuredClone(heroManifest.schema.fields)];

  const wrongType = matchingFields();
  wrongType.find((field) => field.slug === "heading")!.type = "textarea";
  assert.throws(
    () => assertPageBlockDefinitions([page], true, definition(wrongType)),
    /field "heading" has type "textarea"; the local manifest expects "text"/,
  );

  const wrongOptions = matchingFields();
  wrongOptions.find((field) => field.slug === "variant")!.options![0].label = "Standard";
  assert.throws(
    () => assertPageBlockDefinitions([page], true, definition(wrongOptions)),
    /field "variant" has options that differ from its local manifest/,
  );

  const wrongMetadata = matchingFields();
  wrongMetadata.find((field) => field.slug === "heading")!.name = "Title";
  assert.throws(
    () => assertPageBlockDefinitions([page], true, definition(wrongMetadata)),
    /field "heading" has editor metadata that differs from its local manifest/,
  );

  const wrongNestedField = matchingFields();
  wrongNestedField.find((field) => field.slug === "actions")!.fields![1].type = "text";
  assert.throws(
    () => assertPageBlockDefinitions([page], true, definition(wrongNestedField)),
    /field "actions.href" has type "text"; the local manifest expects "url"/,
  );

  const unsupportedField = [...matchingFields(), { name: "Custom", slug: "custom", type: "text" as const }];
  assert.throws(
    () => assertPageBlockDefinitions([page], true, definition(unsupportedField)),
    /has fields not supported by its local manifest: custom.*Fork the semantic identity/,
  );
});

test("accepts required metadata omitted by the Backstage account-block normalizer", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{ id: "block-1", type: "hero", fields: { heading: "Welcome" } }],
  });
  const fields = [...structuredClone(heroManifest.schema.fields)];
  const actions = fields.find((field) => field.slug === "actions")!;
  actions.fields?.forEach((field) => { delete field.required; });

  assert.doesNotThrow(() => assertPageBlockDefinitions([page], true, [{
    slug: "hero",
    registry_identity: heroManifest.registry_identity,
    schema: { fields },
  }]));
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
    schema: { fields: structuredClone(heroManifest.schema.fields) },
  }]));
});

test("validates an application-defined block manifest without a PHP block class", () => {
  const manifest: BlockManifest = {
    manifest_version: 1,
    type: "block",
    registry_identity: "fieldwork:weekly-specials@1",
    name: "Weekly Specials",
    slug: "weekly-specials",
    schema: { fields: [{ name: "Heading", slug: "heading", type: "text" }] },
  };
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{ id: "block-1", type: "weekly-specials", fields: { heading: "This week" } }],
  });

  assert.doesNotThrow(() => assertPageBlockDefinitions([page], true, [{
    slug: "weekly-specials",
    registry_identity: manifest.registry_identity,
    schema: { fields: [structuredClone(manifest.schema.fields[0])] },
  }], [manifest]));
});

test("normalizes website identity while leaving design tokens to the site project", () => {
  const site = normalizeWebsite({
    app_name: "Fieldwork",
    domain: "fieldwork.example.test",
    account: { id: "account-1", name: "Fieldwork Coffee" },
    meta: { title: "Fieldwork", description: "Coffee nearby" },
    open_graph: { title: "Fieldwork social title", image: "https://example.test/og.jpg" },
    favicon_url: "https://example.test/favicon.ico",
    logo: { url: "https://example.test/logo.svg", width: 180, height: 50 },
    theme: { colors: { primary: "#c24436", header: "#000000", headerForeground: "#ffffff", background: "#ffffff" } },
    font_urls: ["https://use.typekit.net/ieq8pyc.css", "https://evil.example.test/fonts.css"],
    font_families: [{ name: "heading", value: "fresno, sans-serif" }],
    social_links: [
      { name: "instagram", url: "https://instagram.com/example" },
      { name: "unsafe", url: "javascript:alert(1)" },
    ],
    home_cta_text: "Order Online",
    home_cta_url: "https://order.example.test",
  });

  assert.equal(site.name, "Fieldwork Coffee");
  assert.equal(site.domain, "fieldwork.example.test");
  assert.equal(site.domain, "fieldwork.example.test");
  assert.equal(site.openGraph?.image, "https://example.test/og.jpg");
  assert.equal(site.logo?.width, 180);
  assert.equal("theme" in site, false);
  assert.deepEqual(site.socialLinks, [{ name: "instagram", url: "https://instagram.com/example" }]);
  assert.deepEqual(site.homeCta, { text: "Order Online", url: "https://order.example.test" });
});

test("does not consume website theme and font settings for a custom headless site", () => {
  const site = normalizeWebsite({
    app_name: "Unsafe Site",
    theme: { colors: { primary: "red; background:url(javascript:alert(1))" } },
    font_families: [{ name: "default", value: "serif; background: red" }],
    font_urls: ["http://fonts.googleapis.com/css?family=Unsafe", "https://evil.example.test/fonts.css"],
    logo: { url: "javascript:alert(1)" },
    favicon_url: "javascript:alert(1)",
  });

  assert.equal("theme" in site, false);
  assert.equal(site.logo, null);
  assert.equal(site.faviconUrl, null);
});

test("normalizes Backstage form fields and legacy choice/time types", () => {
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
        { id: "field-4", name: null, label: "Desired Position", type: "dropdown", required: true, options: ["Server", "Cook"] },
        { id: "field-5", name: null, label: "Organization Type", type: "single-choice", required: true, options: ["School", "Team"] },
        { id: "field-6", name: null, label: "Attachments", type: "multiple-choice", required: false, options: ["Logo", "Tax Letter"] },
        { id: "field-7", name: null, label: "Requested Time", type: "time", required: true, options: [] },
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
  assert.deepEqual(form.fields.slice(3).map((field) => field.type), ["select", "radio", "checkbox", "time"]);
  assert.deepEqual(form.fields.slice(3, 6).map((field) => field.name), ["desired_position", "organization_type", "attachments"]);
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
      children: [{ id: "menu-2", text: "Dinner", url: "/menus/dinner", style: "button", new_window: true }],
    }],
  });

  assert.deepEqual(navigation, [{
    id: "menu-1",
    text: "Menus",
    url: "/menus/",
    newWindow: false,
    style: "link",
    children: [{ id: "menu-2", text: "Dinner", url: "/menus/dinner/", newWindow: true, style: "button", children: [] }],
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

test("localizes known same-site rich-text links only in a preview context", () => {
  const html = sanitizeRichText(
    '<p><a href="https://www.goallinebar.com/menu">Menu</a> <a href="https://order.goallinebar.com">Order</a></p>',
    { siteDomain: "goallinebar.com", routePaths: ["/menu"] },
  );

  assert.match(html, /href="\/menu\/?"/);
  assert.match(html, /href="https:\/\/order\.goallinebar\.com"/);
});

test("preserves the primary legacy heading and formatting while removing unsafe inline styles", () => {
  const html = sanitizeRichText(
    '<h1 style="text-align: center; color: #c24436; position: fixed">WELCOME</h1><div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 2rem"><p style="font-size: 1.25rem; line-height: 1.6 !important">Hello</p></div><script>alert(1)</script>',
    undefined,
    { preserveFirstH1: true },
  );

  assert.match(html, /<h1[^>]*>WELCOME<\/h1>/);
  assert.match(html, /text-align:\s*center/i);
  assert.match(html, /color:\s*#c24436/i);
  assert.match(html, /grid-template-columns:\s*1fr 1fr/i);
  assert.match(html, /line-height:\s*1\.6\s*!important/i);
  assert.doesNotMatch(html, /position|<script|alert\(1\)/i);
});

test("demotes rich-text h1 headings unless one is selected as the page heading", () => {
  assert.equal(sanitizeRichText("<h1>First</h1><h1>Second</h1>"), "<h2>First</h2><h2>Second</h2>");
  assert.equal(
    sanitizeRichText("<h1>First</h1><h1>Second</h1>", undefined, { preserveFirstH1: true }),
    "<h1>First</h1><h2>Second</h2>",
  );
});
