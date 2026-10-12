import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveSeoMetadata } from "../src/lib/seo-metadata";
import { parseBlueprintRoute } from "../src/site/blueprint-routes";

const site = {
  name: "Fieldwork Coffee",
  meta: { description: "A neighborhood cafe." },
  openGraph: { title: "Fieldwork Coffee | Welcome", description: "Visit Fieldwork Coffee." },
};

test("uses page-specific content for descriptions and social titles", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Our Story",
      is_home: false,
      blocks: [{ id: "story", type: "rich-text", fields: { body: "<p>Independent coffee, thoughtfully sourced and served daily.</p>" } }],
    },
    site,
  });

  assert.equal(metadata.title, "Our Story | Fieldwork Coffee");
  assert.equal(metadata.description, "Independent coffee, thoughtfully sourced and served daily.");
  assert.equal(metadata.openGraphTitle, metadata.title);
  assert.equal(metadata.openGraphDescription, metadata.description);
});

test("keeps explicit page metadata above block and site fallbacks", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Our Story",
      is_home: false,
      meta: { title: "How We Started", description: "<p>Page description.</p>" },
      blocks: [{ id: "story", type: "rich-text", fields: { body: "Block description." } }],
    },
    site,
  });

  assert.equal(metadata.title, "How We Started | Fieldwork Coffee");
  assert.equal(metadata.description, "Page description.");
  assert.equal(metadata.openGraphTitle, "How We Started");
});

test("uses the site Open Graph title only for the home page", () => {
  const page = { title: "About", is_home: false, blocks: [] };
  const home = { ...page, title: "Home", is_home: true };

  assert.equal(resolveSeoMetadata({ page, site }).openGraphTitle, "About | Fieldwork Coffee");
  assert.equal(resolveSeoMetadata({ page: home, site }).openGraphTitle, "Fieldwork Coffee | Welcome");
});

test("derives safe, concise descriptions from rich text", () => {
  const metadata = resolveSeoMetadata({
    page: {
      title: "Contact",
      is_home: false,
      blocks: [{ id: "story", type: "rich-text", fields: { body: `<p>${"Visit us & enjoy a fresh cup. ".repeat(10)}</p><script>ignore this</script>` } }],
    },
    site,
  });

  assert.ok(metadata.description.length <= 160);
  assert.ok(metadata.description.includes("&"));
  assert.ok(!metadata.description.includes("ignore this"));
  assert.ok(metadata.description.endsWith("..."));
});

test("keeps route resolver meta.seo ahead of generated route titles and descriptions", () => {
  const route = parseBlueprintRoute("/happenings/community-supper/", {
    type: "happening",
    data: {
      id: "entry-1",
      primary_field_value: "Generated event title",
      unstable_data: { title: "Generated event title" },
    },
    meta: {
      id: "entry-1",
      type: "happening",
      path: "/happenings/community-supper/",
      seo: { title: "Resolver SEO title", description: "Resolver SEO description." },
      blueprint: {
        id: "blueprint-1",
        name: "Happenings",
        slug: "happenings",
        description: "Blueprint fallback description.",
        fields: [{ name: "Title", slug: "title", type: "text", is_primary: true, show_in_list: true }],
      },
    },
  });

  assert.ok(route && route.kind === "entry");
  if (!route || route.kind !== "entry") return;

  const metadata = resolveSeoMetadata({
    routeTitle: route.seoTitle ?? route.title,
    routeDescription: route.seoDescription,
    site,
  });

  assert.equal(metadata.title, "Resolver SEO title | Fieldwork Coffee");
  assert.equal(metadata.description, "Resolver SEO description.");
});

test("resolves and applies route SEO for generated event and press indexes and details", async () => {
  const routePage = await readFile(new URL("../src/pages/[...slug].astro", import.meta.url), "utf8");

  assert.match(routePage, /routePlan\.eventRoutes\.map\(\(\{ path \}\) => path\)/);
  assert.match(routePage, /routePlan\.pressRoutes\.map\(\(\{ path \}\) => path\)/);
  assert.match(routePage, /routeSeo: generatedRouteSeo\.get\(eventRoute\.path\) \?\? null/);
  assert.match(routePage, /routeSeo: generatedRouteSeo\.get\(pressRoute\.path\) \?\? null/);
  assert.match(routePage, /const pageTitle = routeSeo\?\.title \?\?/);
  assert.match(routePage, /const pageDescription = routeSeo\?\.description \?\?/);
});
