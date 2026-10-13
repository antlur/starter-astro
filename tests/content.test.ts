import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  resolveFooterNavigation,
} from "../src/lib/backstage/content";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import { normalizeMenu } from "../src/lib/backstage/menus";
import type { BlockManifest } from "../src/lib/backstage/sync-blocks";
import { attachBackstageForms, normalizeFormDefinition } from "../src/lib/backstage/forms";
import { sanitizeRichText } from "../src/lib/sanitize-rich-text";
import {
  defaultPageLayoutSlug,
  pageLayoutDefinitions,
  resolvePageLayoutSlug,
} from "../src/layouts/definitions";

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
const imageLinkGridManifest = blockManifest("image-link-grid");
const upcomingEventsManifest = blockManifest("upcoming-events");
const instagramFeedManifest = blockManifest("instagram-feed");
const videoHeroManifest = blockManifest("video-hero");
const blockRendererSource = readFileSync(new URL("../src/components/BlockRenderer.astro", import.meta.url), "utf8");
const videoHeroRendererSource = readFileSync(new URL("../src/blocks/video-hero/VideoHero.astro", import.meta.url), "utf8");
const pageLayoutRendererSource = readFileSync(new URL("../src/components/PageLayoutRenderer.astro", import.meta.url), "utf8");
const navigationTreeSource = readFileSync(new URL("../src/components/NavigationTree.astro", import.meta.url), "utf8");
const siteLayoutSource = readFileSync(new URL("../src/layouts/SiteLayout.astro", import.meta.url), "utf8");
const pageLayoutDefinitionsSource = readFileSync(new URL("../src/layouts/definitions.ts", import.meta.url), "utf8");
const backstageConfigSource = readFileSync(new URL("../backstage.config.ts", import.meta.url), "utf8");
const localLayoutFields = () => structuredClone(pageLayoutDefinitions[0].schema.fields);

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
    "starter-astro:image-link-grid@1",
    "starter-astro:image@1",
    "starter-astro:instagram-feed@1",
    "starter-astro:media-with-text@1",
    "starter-astro:menu@1",
    "starter-astro:rich-text@1",
    "starter-astro:upcoming-events@1",
    "starter-astro:video-hero@1",
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

test("Image Link Grid provides accessible linked-image fields and a local renderer", () => {
  const items = imageLinkGridManifest.schema.fields.find((field) => field.slug === "items");

  assert.equal(imageLinkGridManifest.registry_identity, "starter-astro:image-link-grid@1");
  assert.deepEqual(items?.fields?.map(({ slug, type, required }) => [slug, type, required]), [
    ["image", "image", true],
    ["link_url", "url", true],
    ["link_label", "text", true],
  ]);
  assert.match(blockRendererSource, /"image-link-grid": ImageLinkGrid/);
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

test("public Menu blocks reject unpublished menus but allow legacy unknown publication status", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const pageFor = (menuId: string) => normalizePage({
    id: `page-${menuId}`,
    title: menuId,
    slug: menuId,
    pathname: `/${menuId}`,
    blocks: [{ id: `block-${menuId}`, type: "menu", fields: { menu_id: { id: menuId } } }],
  });
  const normalize = (id: string, published_at?: string | null) => normalizeMenu({
    id,
    title: id,
    slug: id,
    ...(published_at === undefined ? {} : { published_at }),
    categories: [],
  }, 0, new Map(), now);
  const attach = (menu: ReturnType<typeof normalizeMenu>) => {
    const page = pageFor(menu.id);
    attachMenusToBlocks([page], [menu]);
    return page.blocks[0].menu;
  };

  const published = normalize("published", "2026-10-10T12:00:00.000Z");
  assert.equal(published.isPublished, true);
  assert.equal(attach(published)?.id, "published");

  const draft = normalize("draft", null);
  assert.equal(draft.isPublished, false);
  assert.throws(() => attach(draft), /references unpublished menu draft/);

  const scheduled = normalize("scheduled", "2026-10-12T12:00:00.000Z");
  assert.equal(scheduled.isPublished, false);
  assert.throws(() => attach(scheduled), /references unpublished menu scheduled/);

  const legacy = normalize("legacy");
  assert.equal(legacy.isPublished, null);
  assert.equal(attach(legacy)?.id, "legacy");

  const unknown = { ...legacy };
  delete unknown.isPublished;
  assert.equal(attach(unknown)?.id, "legacy");
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

test("Video Hero has a distinct accessible video contract and renderer", () => {
  assert.deepEqual(videoHeroManifest.schema.fields.map((field) => field.slug), [
    "eyebrow",
    "heading",
    "body",
    "video",
    "poster",
    "actions",
  ]);
  assert.equal(videoHeroManifest.registry_identity, "starter-astro:video-hero@1");
  assert.equal(videoHeroManifest.schema.fields.find((field) => field.slug === "video")?.type, "media");
  assert.equal(videoHeroManifest.schema.fields.find((field) => field.slug === "video")?.required, true);
  assert.match(videoHeroRendererSource, /prefers-reduced-motion: reduce/);
  assert.match(videoHeroRendererSource, /Pause background video/);
  assert.match(videoHeroRendererSource, /aria-hidden="true"/);
  assert.match(videoHeroRendererSource, /rgb\(0 0 0 \/ (?:5[4-9]|[6-9]\d)%\) 100%\)/);
});

test("every block manifest has a registered Astro renderer", () => {
  const rendererKeys = new Set(
    Array.from(blockRendererSource.matchAll(/^\s*["']?([\w-]+)["']?\s*:/gm), (match) => match[1]),
  );

  for (const manifest of blockManifests) {
    assert.ok(rendererKeys.has(manifest.slug), `Missing renderer for ${manifest.slug}`);
  }
});

test("layout manifests use the shared contract and every configured layout has an Astro renderer", () => {
  const rendererSlugs = Array.from(
    pageLayoutRendererSource.matchAll(/^\s*["']?([\w-]+)["']?\s*:\s*\w+,$/gm),
    (match) => match[1],
  );

  assert.deepEqual(rendererSlugs.sort(), pageLayoutDefinitions.map(({ slug }) => slug).sort());
  assert.equal(existsSync(new URL("../src/layouts/standard-page/manifest.json", import.meta.url)), true);
  assert.equal(existsSync(new URL("../src/layouts/standard-page/definition.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/layouts/standard-page/StandardPage.astro", import.meta.url)), true);
  assert.equal(pageLayoutDefinitions.length, 1);
  assert.deepEqual(Object.keys(pageLayoutDefinitions[0]).sort(), [
    "manifest_version",
    "name",
    "schema",
    "slug",
    "type",
  ]);
  assert.deepEqual(Object.keys(pageLayoutDefinitions[0].schema).sort(), ["fields"]);
  assert.equal(pageLayoutDefinitions[0].manifest_version, 1);
  assert.equal(pageLayoutDefinitions[0].type, "layout");
  assert.equal(pageLayoutDefinitions[0].name, "Starter Astro Standard Page");
  assert.equal(pageLayoutDefinitions[0].slug, "starter-astro-standard-page");
  assert.equal(defaultPageLayoutSlug, "starter-astro-standard-page");
  assert.deepEqual(pageLayoutDefinitions[0].schema.fields.map(({ name, slug, type, order }) => [name, slug, type, order]), [
    ["Content width", "content_width", "select", 0],
    ["Section spacing", "section_spacing", "select", 1],
  ]);
  assert.deepEqual(pageLayoutDefinitions[0].schema.fields.map(({ options }) => options), [
    [
      { label: "Narrow", value: "narrow" },
      { label: "Standard", value: "standard" },
      { label: "Wide", value: "wide" },
    ],
    [
      { label: "Compact", value: "compact" },
      { label: "Comfortable", value: "comfortable" },
      { label: "Spacious", value: "spacious" },
    ],
  ]);
  assert.doesNotMatch(pageLayoutDefinitionsSource, /\.astro["']/);
  assert.equal(defaultPageLayoutSlug, pageLayoutDefinitions[0].slug);
  assert.match(backstageConfigSource, /blockManifestDirectory:\s*["']src\/blocks["']/);
  assert.match(backstageConfigSource, /layouts:\s*pageLayoutDefinitions/);
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
      schema: { fields: [localLayoutFields()[0]] },
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
          { name: "Hero alignment", slug: "hero_alignment", type: "text" },
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
      ? { ...field, options: field.options?.map((option, index) => index === 0 ? { ...option, label: "Slim" } : option) }
      : field,
  );
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongOptions)], true),
    /field "content_width" has options that differ from its local Astro definition/,
  );
});

test("validates nested layout fields, multiplicity, and metadata like block fields", () => {
  const localFields: Field[] = [{
    name: "Actions",
    slug: "actions",
    type: "repeater",
    is_multiple: true,
    order: 0,
    fields: [{
      name: "Label",
      slug: "label",
      type: "text",
      description: "Button label",
      placeholder: "Order online",
      is_multiple: true,
      required: true,
      order: 0,
    }],
  }];
  const definition = [{ slug: defaultPageLayoutSlug, schema: { fields: localFields } }];
  const makePage = (fields: unknown[]) => normalizePage({
    id: "page-nested-layout",
    title: "About",
    slug: "about",
    pathname: "/about",
    layout: {
      id: "layout-nested",
      name: "Standard",
      slug: defaultPageLayoutSlug,
      schema: { fields },
      data: {},
    },
    blocks: [],
  });
  const matchingFields = () => structuredClone(localFields);

  assert.doesNotThrow(() => assertPageLayoutDefinitions([makePage(matchingFields())], true, definition));

  const legacyFields = matchingFields();
  delete legacyFields[0].fields![0].required;
  assert.doesNotThrow(() => assertPageLayoutDefinitions([makePage(legacyFields)], true, definition));

  const wrongMultiplicity = matchingFields();
  wrongMultiplicity[0].is_multiple = false;
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongMultiplicity)], true, definition),
    /field "actions" has a multiple-value setting that differs from its local Astro definition/,
  );

  const wrongNestedMultiplicity = matchingFields();
  wrongNestedMultiplicity[0].fields![0].is_multiple = false;
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongNestedMultiplicity)], true, definition),
    /field "actions\.label" has a multiple-value setting that differs from its local Astro definition/,
  );

  const wrongNestedMetadata = matchingFields();
  wrongNestedMetadata[0].fields![0].placeholder = "Learn more";
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(wrongNestedMetadata)], true, definition),
    /field "actions\.label" has editor metadata that differs from its local Astro definition/,
  );

  const missingNestedField = matchingFields();
  missingNestedField[0].fields = [];
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(missingNestedField)], true, definition),
    /missing fields from its local definition: label.*npm run sync:layouts/,
  );

  const unsupportedNestedField = matchingFields();
  unsupportedNestedField[0].fields!.push({ name: "Icon", slug: "icon", type: "text" });
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(unsupportedNestedField)], true, definition),
    /fields not supported by its local Astro renderer: icon/,
  );

  const malformedNestedFields = matchingFields();
  (malformedNestedFields[0] as unknown as { fields: unknown }).fields = "not-an-array";
  assert.throws(
    () => assertPageLayoutDefinitions([makePage(malformedNestedFields)], true, definition),
    /has an invalid field at index 0/,
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

test("rejects required-field drift in nested fields while treating local omission as false", () => {
  const makeManifest = (): BlockManifest => ({
    manifest_version: 1,
    type: "block",
    registry_identity: "fieldwork:required-parity@1",
    name: "Required Parity",
    slug: "required-parity",
    schema: { fields: [structuredClone(heroManifest.schema.fields.find((field) => field.slug === "actions")!)] },
  });
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{ id: "block-1", type: "required-parity", fields: {} }],
  });
  const assertRequiredMismatch = (localRequired: boolean | undefined, accountRequired: boolean) => {
    const localManifest = makeManifest();
    const localField = localManifest.schema.fields[0].fields![0];
    if (localRequired === undefined) delete localField.required;
    else localField.required = localRequired;

    const accountFields: Field[] = structuredClone([...localManifest.schema.fields]);
    accountFields[0].fields![0].required = accountRequired;

    assert.throws(
      () => assertPageBlockDefinitions([page], true, [{
        slug: localManifest.slug,
        registry_identity: localManifest.registry_identity,
        schema: { fields: accountFields },
      }], [localManifest]),
      /field "actions\.label" has required set to ".*"; the local manifest expects ".*"/,
    );
  };

  assertRequiredMismatch(true, false);
  assertRequiredMismatch(false, true);
  assertRequiredMismatch(undefined, true);
});

test("accepts required metadata omitted by older Backstage responses", () => {
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

test("rejects missing required block values and identifies nested repeater rows", () => {
  const manifest: BlockManifest = {
    manifest_version: 1,
    type: "block",
    registry_identity: "fieldwork:required-content@1",
    name: "Required Content",
    slug: "required-content",
    schema: {
      fields: [
        { name: "Eyebrow", slug: "eyebrow", type: "text", required: true },
        { name: "Heading", slug: "heading", type: "text", required: true },
        { name: "Body", slug: "body", type: "rich_text", required: true },
        { name: "Images", slug: "image", type: "image_list", required: true },
        { name: "Logo", slug: "logo", type: "image", required: true },
        {
          name: "Actions",
          slug: "actions",
          type: "repeater",
          required: true,
          fields: [
            { name: "Label", slug: "label", type: "text", required: true },
            { name: "URL", slug: "href", type: "url", required: true },
          ],
        },
      ],
    },
  };
  const page = normalizePage({
    id: "page-1",
    title: "About",
    slug: "about",
    pathname: "/about/",
    blocks: [
      {
        id: "hero-1",
        type: "required-content",
        fields: {
          heading: "   ",
          body: null,
          image: [],
          logo: {},
          actions: [
            { label: "  ", href: "/menu/" },
            { label: "Visit", href: null },
            {},
          ],
        },
      },
      { id: "hero-2", type: "required-content", fields: { actions: {} } },
    ],
  });
  const definition = {
    slug: "required-content",
    registry_identity: manifest.registry_identity,
    schema: { fields: structuredClone(manifest.schema.fields) },
  };
  const originalBlocks = structuredClone(page.blocks);

  assert.throws(
    () => assertPageBlockDefinitions([page], true, [definition], [manifest]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Page "\/about\/" block "required-content" \(id "hero-1"\) field "eyebrow" is required but has no value/);
      assert.match(error.message, /block "required-content" \(id "hero-1"\) field "heading" is required but has no value/);
      assert.match(error.message, /field "body" is required but has no value/);
      assert.match(error.message, /field "image" is required but has no value/);
      assert.match(error.message, /field "logo" is required but has no value/);
      assert.match(error.message, /field "actions\[0\]\.label" is required but has no value/);
      assert.match(error.message, /field "actions\[1\]\.href" is required but has no value/);
      assert.match(error.message, /field "actions\[2\]\.label" is required but has no value/);
      assert.match(error.message, /field "actions\[2\]\.href" is required but has no value/);
      assert.match(error.message, /block "required-content" \(id "hero-2"\) field "actions" must contain at least one row/);
      return true;
    },
  );
  assert.deepEqual(page.blocks, originalBlocks);

  const completePage = normalizePage({
    id: "page-2",
    title: "About",
    slug: "about",
    pathname: "/about/",
    blocks: [{
      id: "hero-3",
      type: "required-content",
      fields: {
        eyebrow: "Our story",
        heading: "Welcome",
        body: "<p>Learn about us.</p>",
        image: [{ id: "image-1" }],
        logo: { id: "logo-1" },
        actions: [{ label: "Explore", href: "/menu/" }],
      },
    }],
  });
  assert.doesNotThrow(() => assertPageBlockDefinitions([completePage], true, [definition], [manifest]));
});

test("allows empty optional block values", () => {
  const page = normalizePage({
    id: "page-1",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{
      id: "hero-1",
      type: "hero",
      fields: { heading: "  ", body: null, image: [], logo: {}, actions: [] },
    }],
  });

  assert.doesNotThrow(() => assertPageBlockDefinitions([page], true, [{
    slug: "hero",
    registry_identity: heroManifest.registry_identity,
    schema: { fields: structuredClone(heroManifest.schema.fields) },
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

test("normalizes a local website CTA to its static site route", () => {
  const site = normalizeWebsite({ home_cta_text: "Browse the menu", home_cta_url: "/menu" });

  assert.deepEqual(site.homeCta, { text: "Browse the menu", url: "/menu/" });
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
      children: [
        { id: "menu-2", text: "Dinner", url: "/menus/dinner", style: "button", new_window: true },
        {
          id: "menu-pdf",
          text: "Download",
          url: "/menus/dinner.pdf?download=1",
          new_window: true,
          children: [{ id: "menu-details", text: "Details", url: "/menus/dinner/details", new_window: false }],
        },
      ],
    }],
  });

  assert.deepEqual(navigation, [{
    id: "menu-1",
    text: "Menus",
    url: "/menus/",
    newWindow: false,
    style: "link",
    children: [
      { id: "menu-2", text: "Dinner", url: "/menus/dinner/", newWindow: true, style: "button", children: [] },
      {
        id: "menu-pdf",
        text: "Download",
        url: "/menus/dinner.pdf?download=1",
        newWindow: true,
        style: "link",
        children: [{
          id: "menu-details",
          text: "Details",
          url: "/menus/dinner/details/",
          newWindow: false,
          style: "link",
          children: [],
        }],
      },
    ],
  }]);

  assert.throws(
    () => normalizeNavigation({ items: [{ id: "unsafe", text: "Unsafe", url: "javascript:alert(1)" }] }),
    /unsupported URL/,
  );
});

test("reuses selected header navigation as footer navigation when IDs match", async () => {
  const selectedNavigation = normalizeNavigation({
    items: [{ id: "primary", text: "Primary", url: "/", children: [] }],
  });
  let fetchCount = 0;

  const footer = await resolveFooterNavigation(
    "navigation-1",
    "navigation-1",
    selectedNavigation,
    ["navigation-1"],
    async () => {
      fetchCount += 1;
      throw new Error("same navigation should not be fetched twice");
    },
  );

  assert.strictEqual(footer, selectedNavigation);
  assert.equal(fetchCount, 0);
});

test("renders all navigation depths in header and footer trees", () => {
  assert.match(siteLayoutSource, /<NavigationTree items=\{navigation\} variant="header" pathname=\{pathname\} \/>/);
  assert.match(siteLayoutSource, /<NavigationTree items=\{footerNavigation\} variant="footer" pathname=\{pathname\} \/>/);
  assert.match(navigationTreeSource, /item\.children\.length > 0 && variant === "header"/);
  assert.match(navigationTreeSource, /item\.children\.length > 0 && variant === "footer"/);
  assert.equal([...navigationTreeSource.matchAll(/<Astro\.self items=\{item\.children\}/g)].length, 2);
  assert.match(navigationTreeSource, /<details class="site-nav-menu">[\s\S]*?<summary aria-label=\{`Show \$\{item\.text\} pages`\}/);
  assert.match(navigationTreeSource, /class=\{listClass\}/);
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
    '<p><a href="https://www.goallinebar.com/menu">Menu</a> <a href="https://order.goallinebar.com">Order</a> <a href="/menu?source=about">Local menu</a></p>',
    { siteDomain: "goallinebar.com", routePaths: ["/menu"] },
  );

  assert.match(html, /href="\/menu\/?"/);
  assert.match(html, /href="https:\/\/order\.goallinebar\.com"/);
  assert.ok(html.includes('href="/menu/?source=about"'));
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
