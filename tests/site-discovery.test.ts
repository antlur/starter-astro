import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  jsonLdForPage,
  loadSiteContentForReadiness,
  normalizeStructuredData,
  readStructuredData,
  serializeJsonLd,
  structuredDataNodeForLocation,
  type SiteContentReadClient,
} from "../src/lib/backstage/content";
import { collectLlmsLinks, renderLlmsTxt } from "../src/pages/llms.txt";
import { renderRobotsTxt } from "../src/pages/robots.txt";

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fieldwork",
};

const restaurantDocument = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Restaurant", identifier: "loc-1", name: "Main <Street>" },
    { "@type": "Restaurant", identifier: { value: "loc-2" }, name: "South" },
  ],
};

const httpError = (status: number): Error => {
  const error = new Error(`HTTP ${status}: failure`);
  Object.assign(error, { status });
  return error;
};

test("keeps Organization JSON-LD until a restaurant graph is available", () => {
  assert.equal(jsonLdForPage(null, organization), organization);
  assert.equal(jsonLdForPage({ "@graph": [] }, organization), organization);
  assert.equal(jsonLdForPage(restaurantDocument, organization), restaurantDocument);
});

test("serializes JSON-LD without a raw less-than character", () => {
  assert.equal(serializeJsonLd({ name: "</script>" }), '{"name":"\\u003c/script>"}');
});

test("selects a location page node by identifier", () => {
  const node = structuredDataNodeForLocation(restaurantDocument, "loc-2");
  assert.equal(node?.["@type"], "Restaurant");
  assert.equal(node?.["@context"], "https://schema.org");
  assert.equal(node?.name, "South");
  assert.equal(structuredDataNodeForLocation(restaurantDocument, "missing"), null);
  assert.equal(structuredDataNodeForLocation({ "@graph": [] }, "loc-1"), null);
});

test("accepts a JSON-LD document or a data envelope", () => {
  assert.equal(normalizeStructuredData(restaurantDocument)?.["@graph"].length, 2);
  assert.equal(normalizeStructuredData({ data: restaurantDocument })?.["@graph"][0].identifier, "loc-1");
  assert.equal(normalizeStructuredData({ data: [] }), null);
  assert.equal(normalizeStructuredData({ "@graph": ["nope"] }), null);
});

test("reads structured data from the SDK method, then the read endpoint", async () => {
  const requests: string[] = [];
  const sdk = await readStructuredData({
    structuredData: { async get() { requests.push("sdk"); return restaurantDocument; } },
    async get(path: string) { requests.push(path); return null; },
  });
  assert.equal(sdk?.["@graph"].length, 2);
  assert.deepEqual(requests, ["sdk"]);

  const direct = await readStructuredData({
    async get(path: string) {
      requests.push(path);
      return { data: restaurantDocument };
    },
  });
  assert.equal(direct?.["@graph"][1].name, "South");
  assert.deepEqual(requests, ["sdk", "/structured-data"]);
});

test("structured data failures leave the build with an empty document", async () => {
  assert.equal(await readStructuredData({}), null);
  assert.equal(await readStructuredData({ async get() { throw httpError(404); } }), null);
  assert.equal(await readStructuredData({ async get() { throw httpError(500); } }), null);
  assert.equal(await readStructuredData({ async get() { return { html: "<p>no</p>" }; } }), null);
});

test("stores a restaurant graph next to locations and ignores a missing endpoint", async () => {
  const content = await loadSiteContentForReadiness(readClient({
    structuredData: { async get() { return restaurantDocument; } },
  }));
  assert.equal(content.structuredData?.["@graph"][0].identifier, "loc-1");
  assert.deepEqual(content.locations, []);

  const missing = await loadSiteContentForReadiness(readClient({
    async get() { throw httpError(404); },
  }));
  assert.equal(missing.structuredData, null);
});

test("robots.txt blocks crawlers until the site is indexable", () => {
  assert.equal(renderRobotsTxt(false, "https://starter.example/sitemap-index.xml"), "User-agent: *\nDisallow: /\n");

  const indexable = renderRobotsTxt(true, "https://starter.example/sitemap-index.xml");
  assert.match(indexable, /^User-agent: \*\nAllow: \/\n/);
  for (const agent of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"]) {
    assert.match(indexable, new RegExp(`User-agent: ${agent}\\nAllow: /`));
  }
  assert.match(indexable, /User-agent: CCBot\nDisallow: \/\n\nUser-agent: Bytespider\nDisallow: \/\n\nSitemap: https:\/\/starter\.example\/sitemap-index\.xml\n$/);
});

test("llms.txt lists the site summary and absolute location and menu URLs", () => {
  const site = new URL("https://starter.example");
  const links = collectLlmsLinks(site, {
    locationIndexPaths: ["/locations/"],
    locationRoutes: [
      { path: "/locations/main/", location: { name: "Main [Street]", isPublic: true, status: "open" } },
      { path: "/locations/draft/", location: { name: "Draft", isPublic: false, status: "draft" } },
    ],
    menuIndexPaths: ["/menu/"],
    menuRoutes: [
      { path: "/menu/all-day/", label: "All Day", menu: { title: "All Day", isPublished: true } },
      { path: "/menu/secret/", label: "Secret", menu: { title: "Secret", isPublished: false } },
    ],
  });
  const text = renderLlmsTxt({
    name: "Fieldwork Coffee",
    description: "Thoughtful coffee,\nand a place to land.",
    ...links,
  });

  assert.match(text, /^# Fieldwork Coffee\n\n> Thoughtful coffee, and a place to land\.\n/);
  assert.match(text, /- \[Locations\]\(https:\/\/starter\.example\/locations\/\)/);
  assert.match(text, /- \[Main Street\]\(https:\/\/starter\.example\/locations\/main\/\)/);
  assert.doesNotMatch(text, /Draft/);
  assert.match(text, /- \[Menus\]\(https:\/\/starter\.example\/menu\/\)/);
  assert.match(text, /- \[All Day\]\(https:\/\/starter\.example\/menu\/all-day\/\)/);
  assert.doesNotMatch(text, /Secret/);
  assert.equal(collectLlmsLinks(undefined, { locationIndexPaths: ["/locations/"], locationRoutes: [], menuIndexPaths: [], menuRoutes: [] }).locations.length, 0);
});

test("location pages use the graph node instead of a local LocalBusiness", () => {
  const locationPage = readFileSync(new URL("../src/components/LocationPage.astro", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../src/layouts/SiteLayout.astro", import.meta.url), "utf8");

  assert.match(locationPage, /structuredDataNodeForLocation\(structuredData, location\.id\)/);
  assert.doesNotMatch(locationPage, /locationStructuredData/);
  assert.match(layout, /serializeJsonLd\(jsonLdForPage\(structuredData, organization\)\)/);
  assert.match(layout, /<script type="application\/ld\+json" set:html=\{jsonLd\} \/>/);
});

const readClient = (extra: object): SiteContentReadClient => ({
  website: {
    async getWebsites() { return [{ app_name: "Demo" }]; },
    async routes() { return ["/"]; },
  },
  pages: {
    async getHeadlessPages() {
      return [{ id: "home", title: "Home", slug: "/", pathname: "/", is_home: true, blocks: [] }];
    },
  },
  navigation: {
    async list() { return []; },
    async getNavigation() { throw new Error("navigation should not be loaded"); },
  },
  locations: { async getLocations() { return []; } },
  alerts: { async getAlerts() { return []; } },
  menus: {
    async getMenus() { return []; },
    async getMenu() { return null; },
  },
  media: { async get() { return null; } },
  modules: { async isEnabled() { return false; } },
  forms: { async getFormDefinition() { throw new Error("forms should not be loaded"); } },
  press: { async getPress() { return []; } },
  blocks: { async list() { return []; } },
  events: { async getEvents() { return []; } },
  instagram: { async latest() { return []; } },
  ...extra,
} as unknown as SiteContentReadClient);
