import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build } from "astro";

const root = fileURLToPath(new URL("../", import.meta.url));
const { parseDocument, DomUtils } = createRequire(import.meta.resolve("sanitize-html"))("htmlparser2");

test("static fixture builds isolate local design and pull both Brand and Theme only when opted in", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "starter-design-source-"));
  const envKeys = ["NODE_ENV", "BACKSTAGE_SOURCE", "BACKSTAGE_SITE_PROFILE", "SITE_INDEXABLE", "SITE_URL"] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const cssPaths = ["brand", "theme", "ui"].map((name) => path.join(root, `src/styles/tokens/${name}.css`));
  const before = await Promise.all(cssPaths.map((file) => readFile(file, "utf8")));
  process.env.NODE_ENV = "production";
  process.env.BACKSTAGE_SOURCE = "fixture";
  process.env.SITE_INDEXABLE = "false";
  process.env.SITE_URL = "https://starter.example";
  try {
    for (const source of ["local", "backstage"]) {
      process.env.BACKSTAGE_SITE_PROFILE = source === "backstage" ? "restaurant" : "";
      await build({
        root,
        outDir: path.join(outputDirectory, "dist"),
        logLevel: "silent",
      });
      execFileSync(process.execPath, [path.join(root, "scripts/assert-theme-token-output.mjs"), source], { cwd: outputDirectory });
      const html = await readFile(path.join(outputDirectory, "dist/index.html"), "utf8");
      assert.match(html, /Fieldwork Coffee/, "Design selection must not replace fixture content.");
    }
    assert.deepEqual(await Promise.all(cssPaths.map((file) => readFile(file, "utf8"))), before, "Builds must not rewrite local token files.");
  } finally {
    for (const key of envKeys) restoreEnv(key, previousEnv.get(key));
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const attributePattern = (name: string, value?: string): RegExp => value === undefined
  ? new RegExp(`(?:^|\\s)${name}(?=\\s|>|$)`)
  : new RegExp(`(?:^|\\s)${name}="${escapeRegExp(value)}"`);

const firstTag = (html: string, expression: RegExp, label: string): string => {
  const match = html.match(expression);
  assert.ok(match, `Expected rendered ${label}.`);
  return match[0];
};

test("Astro renders editorial fixtures accessibly and shares sanitized rich-text styling with Contact Form", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "starter-astro-rendered-blocks-"));
  const envKeys = ["NODE_ENV", "BACKSTAGE_SOURCE", "SITE_INDEXABLE", "SITE_URL"] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  process.env.NODE_ENV = "production";
  process.env.BACKSTAGE_SOURCE = "fixture";
  process.env.SITE_INDEXABLE = "false";
  process.env.SITE_URL = "https://starter.example";

  try {
    await build({ root, outDir: outputDirectory, logLevel: "silent" });
    const html = await readFile(path.join(outputDirectory, "__qa", "rendered-blocks", "index.html"), "utf8");

    const video = firstTag(html, /<video\b[^>]*>/, "background video");
    assert.match(video, attributePattern("src", "https://media.example.test/fieldwork-tour.mp4"));
    assert.match(video, attributePattern("poster", "https://images.example.test/fieldwork-tour-poster.jpg"));
    for (const [name, value] of [
      ["muted", undefined],
      ["loop", undefined],
      ["playsinline", undefined],
      ["preload", "none"],
      ["aria-hidden", "true"],
      ["tabindex", "-1"],
    ] as const) {
      assert.match(video, attributePattern(name, value));
    }
    assert.match(html, /<h1\b[^>]*>A video hero rendered by Astro<\/h1>/);
    assert.match(html, /<section\b[^>]*class="hero hero--text-only"[^>]*>[\s\S]*?<h2\b[^>]*>A hero with no photo yet<\/h2>/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, "the page should have one primary heading");
    assert.doesNotMatch(html, /Empty gallery heading must not render|Empty links heading must not render/);
    assert.doesNotMatch(html, /Empty reviews heading must not render|Sample reviews/);
    assert.match(html, /<h2\b[^>]*>Editorial quote fixture<\/h2>/);
    assert.match(html, /<blockquote\b[^>]*><p\b[^>]*>[^<]*&lt;b&gt;Quote fixture as plain text\.&lt;\/b&gt;/);
    assert.match(html, /href="\/menu\/"[^>]*>Explore the menu<\/a>/);

    const motionButton = firstTag(html, /<button\b[^>]*data-video-hero-toggle[^>]*>/, "video motion control");
    assert.match(motionButton, attributePattern("aria-label", "Play background video"));
    assert.match(motionButton, attributePattern("aria-pressed", "false"));

    const instagramSection = firstTag(html, /<section\b[^>]*class="instagram-feed"[^>]*>/, "Instagram section");
    assert.match(instagramSection, attributePattern("aria-labelledby", "instagram-fixture-qa-instagram-feed"));
    assert.match(html, /<h2\b[^>]*id="instagram-fixture-qa-instagram-feed"[^>]*>Fieldwork on Instagram<\/h2>/);

    const profileLink = firstTag(
      html,
      /<a\b(?=[^>]*href="https:\/\/www\.instagram\.com\/fieldworkcoffee\/"[^>]*>)[^>]*>Follow on Instagram[\s\S]*?<\/a>/,
      "Instagram profile link",
    );
    assert.match(profileLink, attributePattern("target", "_blank"));
    assert.match(profileLink, attributePattern("rel", "noopener noreferrer"));
    assert.match(profileLink, /class="sr-only"[^>]*> \(opens in a new tab\)<\/span>/);

    const postLinks = [...html.matchAll(/<a\b(?=[^>]*class="instagram-feed__post")[^>]*>[\s\S]*?<\/a>/g)]
      .map(([link]) => link);
    assert.equal(postLinks.length, 2, "the feed should render the requested two posts");
    const firstPostLink = postLinks[0];
    assert.ok(firstPostLink, "the first Instagram post should render");
    assert.match(firstPostLink, attributePattern("href", "https://www.instagram.com/p/fixture-morning-coffee/"));
    assert.match(firstPostLink, attributePattern("aria-label", "A bright start to the day."));
    assert.match(firstPostLink, attributePattern("target", "_blank"));
    assert.match(firstPostLink, attributePattern("rel", "noopener noreferrer"));
    assert.match(firstPostLink, /<img\b[^>]*alt=""/);

    const embeddedMenu = firstTag(html, /<section\b[^>]*class="menu-page menu-page--embedded"[^>]*>/, "embedded menu");
    assert.match(embeddedMenu, attributePattern("aria-labelledby", "menu-title-fixture-menu"));
    assert.match(html, /<h2\b[^>]*id="menu-title-fixture-menu"[^>]*>All Day<\/h2>/);
    assert.match(html, /<h3\b[^>]*id="menu-category-fixture-menu-0-title"[^>]*>Coffee<\/h3>/);
    const categoryNav = html.match(/<nav\b(?=[^>]*data-menu-category-nav)(?=[^>]*aria-label="Menu categories")[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(categoryNav, "the embedded menu should render its category navigation");
    assert.deepEqual([...categoryNav.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id), [
      "menu-category-fixture-menu-0", "menu-category-fixture-menu-1",
    ]);
    assert.match(html, /<section\b[^>]*id="menu-category-fixture-menu-1"/);
    assert.match(html, /<h4\b[^>]*>Slow drip coffee<\/h4>/);
    assert.match(html, /Bright, balanced, and brewed fresh throughout the morning\./);
    assert.match(html, /\$3\.50/);
    const categoryPriceItem = html.match(/<article\b(?=[^>]*class="menu-item menu-item--category-pricing")[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(categoryPriceItem, "the category-priced fixture item should render");
    assert.match(categoryPriceItem, /class="menu-item__category-price" role="cell"[^>]*>\$3\.50<\/div>/);
    assert.match(categoryPriceItem, /class="menu-item__category-price" role="cell"[^>]*>\$4\.25<\/div>/);
    assert.match(categoryPriceItem, /<dt[^>]*>Seasonal<\/dt>[\s\S]*?<dd[^>]*>\$5\.00<\/dd>/);
    assert.equal([...categoryPriceItem.matchAll(/\$5\.00/g)].length, 1, "the unmatched price should render once below its item");
    const itemPriceItem = html.match(/<article\b(?=[^>]*class="menu-item")[^>]*>([\s\S]*?<h4[^>]*>Morning bun<\/h4>[\s\S]*?)<\/article>/)?.[1];
    assert.ok(itemPriceItem, "the item without category pricing columns should render");
    assert.match(itemPriceItem, /<dt[^>]*>Morning<\/dt>[\s\S]*?<dd[^>]*>\$4\.50<\/dd>/);
    assert.match(itemPriceItem, /<dt[^>]*>Afternoon<\/dt>[\s\S]*?<dd[^>]*>\$5\.00<\/dd>/);
    const menuDownload = firstTag(html, /<a\b(?=[^>]*class="menu-page__download")[^>]*>Download Menu<\/a>/, "menu PDF link");
    assert.match(menuDownload, attributePattern("href", "https://files.example.test/menus/all-day-coffee.pdf"));
    assert.match(menuDownload, attributePattern("target", "_blank"));
    assert.match(menuDownload, attributePattern("rel", "noopener noreferrer"));
    assert.doesNotMatch(html, /aria-label="Choose a menu"/, "an embedded menu should not show the page-level menu switcher");

    assert.match(html, /<blockquote><p>Gather around the table\.<\/p><\/blockquote>/);
    assert.match(html, /<u>Made with care\.<\/u>/);
    assert.match(html, /<a href="\/contact\/" class="rich-text__button">Book now<\/a>/);
    assert.match(html, /<img class="rich-text__image" src="\/favicon\.svg" alt="Fieldwork Coffee icon" title="Fieldwork Coffee" width="64" height="64" \/>/);
    assert.match(html, /<img class="rich-text__image" src="\/favicon\.svg" alt="" width="16" height="16" \/>/);
    assert.doesNotMatch(html, /inline-block px-4|text-primary-foreground|alignment="center"/);

    const contactHtml = await readFile(path.join(outputDirectory, "contact", "index.html"), "utf8");
    const contactBody = contactHtml.match(/<div class="contact-form-section__body"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(contactBody, "Contact Form should render its rich-text body wrapper.");
    assert.match(contactBody, /<a href="\/menu\/" class="rich-text__button">View the menu<\/a>/);
    assert.match(contactBody, /<img class="rich-text__image" src="\/favicon\.svg" alt="Fieldwork Coffee icon" width="64" height="64" \/>/);
    assert.doesNotMatch(contactBody, /attacker-class|position: fixed|inline-block px-4/);

    const stylesheetPaths = [...contactHtml.matchAll(/<link\b[^>]*>/gi)]
      .map(([tag]) => tag.match(/\bhref="([^"#]+\.css(?:\?[^"#]*)?)"/)?.[1])
      .filter((href): href is string => Boolean(href));
    const stylesheets = await Promise.all(stylesheetPaths.map((href) =>
      readFile(path.join(outputDirectory, href.replace(/^\/+/, "")), "utf8"),
    ));
    const contactStyles = stylesheets.join("\n");
    assert.match(contactStyles, /(?:^|})\s*\.rich-text__button\s*\{[^}]*background:\s*var\(--theme-color-action\)/s);
    assert.match(contactStyles, /(?:^|})\s*\.rich-text__image\s*\{[^}]*max-width:\s*100%[^}]*height:\s*auto/s);

    const primaryNavigation = firstTag(html, /<nav\b[^>]*aria-label="Primary navigation"[^>]*>[\s\S]*?<\/nav>/, "primary navigation");
    assert.doesNotMatch(primaryNavigation, /__qa\/rendered-blocks/, "the internal QA page must not enter visible navigation");
    assert.match(primaryNavigation, /href="\/menu\/all-day\/">All Day<\/a>/);
    assert.match(primaryNavigation, /href="\/menu\/all-day\/#coffee">Coffee<\/a>/);

    const footerNavigation = firstTag(html, /<nav\b[^>]*aria-label="Footer navigation"[^>]*>[\s\S]*?<\/nav>/, "footer navigation");
    assert.match(footerNavigation, /href="\/happenings\/">Happenings<\/a>/);
    assert.match(footerNavigation, /href="\/events\/community-supper\/">Community Supper<\/a>/);

    for (const placement of ["topbar", "footer"]) {
      const socialNavigation = firstTag(html, new RegExp(`<nav class="site-${placement}__social" aria-label="Social media">[\\s\\S]*?<\\/nav>`), `${placement} social navigation`);
      const socialLink = firstTag(socialNavigation, /<a\b[^>]*>/, `${placement} Instagram link`);
      assert.match(socialLink, attributePattern("href", "https://social.example.test/instagram"));
      assert.match(socialLink, attributePattern("aria-label", "Instagram (opens in a new tab)"));
      assert.match(socialLink, attributePattern("target", "_blank"));
      assert.match(socialLink, attributePattern("rel", "noopener noreferrer"));
    }
  } finally {
    for (const key of envKeys) restoreEnv(key, previousEnv.get(key));
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("published SDK navigation trees render nested links in the generated site", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "starter-astro-sdk-navigation-"));
  const envKeys = [
    "NODE_ENV",
    "BACKSTAGE_SOURCE",
    "BACKSTAGE_API_KEY",
    "BACKSTAGE_ACCOUNT_ID",
    "BACKSTAGE_API_URL",
    "SITE_INDEXABLE",
  ] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  const navigationItems = [
    { id: "home", text: "Home", url: "/", parent_id: null },
    { id: "section", text: "Section", url: "/#section", parent_id: "home" },
    { id: "nested", text: "Nested page", url: "/#nested", parent_id: "section" },
  ].map((item) => ({
    ...item,
    html: "",
    new_window: false,
    type: "link",
    style: "link",
    children: [],
  }));
  const responses: Record<string, unknown> = {
    "/websites": {
      data: [{ id: "website-1", app_name: "SDK Navigation Test", header_navigation_id: "navigation-1" }],
    },
    "/websites/website-1/routes": ["/"],
    "/pages": {
      data: [{
        id: "home-page",
        title: "Home",
        slug: "home",
        pathname: "/",
        is_home: true,
        blocks: [],
        settings: null,
        layout: null,
      }],
    },
    "/navigations": { data: [{ id: "navigation-1", name: "Main", items: [] }] },
    "/navigations/navigation-1": {
      data: { id: "navigation-1", name: "Main", items: navigationItems },
    },
    "/locations": { data: [] },
    "/alerts": { data: [] },
    "/structured-data": {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Restaurant", identifier: "sdk-location", name: "SDK <Cafe>" }],
    },
  };

  process.env.NODE_ENV = "production";
  process.env.BACKSTAGE_SOURCE = "api";
  process.env.BACKSTAGE_API_KEY = "test-api-key";
  process.env.BACKSTAGE_ACCOUNT_ID = "test-account-id";
  process.env.BACKSTAGE_API_URL = "https://backstage-api.test/api";
  process.env.SITE_INDEXABLE = "false";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const key = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
    assert.ok(Object.hasOwn(responses, key), `Unexpected mock Backstage request: ${key}`);
    return new Response(JSON.stringify(responses[key]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await build({ root, outDir: outputDirectory, logLevel: "silent" });
    const html = await readFile(path.join(outputDirectory, "index.html"), "utf8");

    assert.match(html, /href="\/#section">Section<\/a>/);
    assert.match(html, /class="site-nav-children site-nav-children--nested"/);
    assert.match(html, /href="\/#nested">Nested page<\/a>/);
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(jsonLd, "the page should publish the Backstage JSON-LD document");
    assert.equal(jsonLd.includes("<"), false);
    assert.equal(JSON.parse(jsonLd)["@graph"][0].name, "SDK <Cafe>");
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of envKeys) restoreEnv(key, previousEnv.get(key));
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

type HtmlNode = {
  name?: string;
  attribs?: Record<string, string>;
  children?: HtmlNode[];
  parent?: HtmlNode | null;
};

const footerClasses = (node: HtmlNode): string[] => node.attribs?.class?.split(/\s+/).filter(Boolean) ?? [];
const footerElements = (rootNode: HtmlNode, name: string): HtmlNode[] => DomUtils.findAll(
  (node: HtmlNode) => node.name === name,
  rootNode.children ?? [],
) as HtmlNode[];
const footerWithClass = (nodes: HtmlNode[], className: string): HtmlNode[] => nodes.filter((node) => footerClasses(node).includes(className));
const footerText = (node: HtmlNode): string => DomUtils.textContent(node).replace(/\s+/g, " ").trim();
const menuLinks = (node: HtmlNode): HtmlNode[] => footerElements(node, "a")
  .filter((link) => /\/menu(?:\/|$)/.test(link.attribs?.href ?? ""));

const buildLocationFooterFixture = async (fixture: string | undefined, profile = "") => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "starter-astro-location-footer-"));
  process.env.NODE_ENV = "production";
  process.env.BACKSTAGE_SOURCE = "fixture";
  if (fixture) process.env.BACKSTAGE_FIXTURE = fixture;
  else delete process.env.BACKSTAGE_FIXTURE;
  process.env.BACKSTAGE_SITE_PROFILE = profile;
  process.env.SITE_INDEXABLE = "false";
  process.env.SITE_URL = "https://starter.example";

  await build({ root, outDir: outputDirectory, logLevel: "silent" });

  return {
    read: async (relativePath: string) => parseDocument(await readFile(path.join(outputDirectory, relativePath), "utf8")),
    cleanup: () => rm(outputDirectory, { recursive: true, force: true }),
  };
};

test("renders the global Location & Hours policy without duplicating authored or generated location surfaces", async () => {
  const envKeys = ["NODE_ENV", "BACKSTAGE_SOURCE", "BACKSTAGE_FIXTURE", "BACKSTAGE_SITE_PROFILE", "SITE_INDEXABLE", "SITE_URL"] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  try {
    const legacy = await buildLocationFooterFixture(undefined);
    const legacyHome = await legacy.read("index.html");
    const legacyAbout = await legacy.read("about/index.html");
    assert.equal(footerWithClass(footerElements(legacyHome, "section"), "location-hours").length, 1);
    assert.equal(footerWithClass(footerElements(legacyHome, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(legacyAbout, "section"), "location-hours").length, 1);
    await legacy.cleanup();

    const shown = await buildLocationFooterFixture("location-footer-show");
    const shownHome = await shown.read("index.html");
    const shownAbout = await shown.read("about/index.html");
    const shownLocation = await shown.read("location/index.html");
    const shownHomePanels = footerWithClass(footerElements(shownHome, "section"), "location-directory--visit-panel");
    assert.equal(shownHomePanels.length, 1);
    const [shownHomePanel] = shownHomePanels;
    assert.ok(shownHomePanel);
    assert.equal(shownHomePanel.parent?.name, "footer");
    assert.ok(footerElements(shownHomePanel, "address").length > 0);
    assert.ok(footerElements(shownHomePanel, "dl").length > 0);
    assert.ok(footerElements(shownHomePanel, "a").some((link) => link.attribs?.href === "/location/"));
    assert.deepEqual(menuLinks(shownHomePanel), [], "The shared footer is for visit details, not menu navigation.");
    assert.equal(footerWithClass(footerElements(shownHome, "section"), "location-hours").length, 0);
    assert.equal(footerWithClass(footerElements(shownAbout, "section"), "location-directory--visit-panel").length, 1);
    assert.equal(footerWithClass(footerElements(shownLocation, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(shownLocation, "section"), "location-hours").length, 0);
    await shown.cleanup();

    const hidden = await buildLocationFooterFixture("location-footer-hide");
    const hiddenHome = await hidden.read("index.html");
    const hiddenAbout = await hidden.read("about/index.html");
    assert.equal(footerWithClass(footerElements(hiddenHome, "section"), "location-hours").length, 0);
    assert.equal(footerWithClass(footerElements(hiddenHome, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(hiddenAbout, "section"), "location-hours").length, 0);
    assert.equal(footerWithClass(footerElements(hiddenAbout, "section"), "location-directory--visit-panel").length, 0);
    await hidden.cleanup();

    const multi = await buildLocationFooterFixture("multi-location-show", "restaurant");
    const multiHome = await multi.read("index.html");
    const multiAbout = await multi.read("about/index.html");
    const multiContact = await multi.read("contact/index.html");
    const multiGuide = await multi.read("visit-guide/index.html");
    const multiLocations = await multi.read("locations/index.html");
    const multiMenuChooser = await multi.read("menu/index.html");
    const marketMenu = await multi.read("locations/market-street/menu/market-all-day/index.html");

    assert.equal(footerWithClass(footerElements(multiHome, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(multiHome, "section"), "location-directory--photo-grid").length, 1);
    assert.equal(footerWithClass(footerElements(multiAbout, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(multiAbout, "section"), "location-directory--compact").length, 1);
    assert.equal(footerWithClass(footerElements(multiContact, "section"), "location-directory--visit-panel").length, 1);
    assert.equal(footerWithClass(footerElements(multiContact, "section"), "location-directory--visit-summary").length, 0);
    const [summary] = footerWithClass(footerElements(multiGuide, "section"), "location-directory--visit-summary");
    assert.ok(summary);
    assert.equal(summary.parent?.name, "footer");
    assert.equal(footerElements(summary, "article").length, 5);
    assert.equal(footerElements(summary, "img").length, 0);
    assert.equal(footerElements(summary, "iframe").length, 0);
    assert.equal(footerElements(summary, "dl").length, 0);
    assert.deepEqual(menuLinks(summary), []);
    assert.equal(footerWithClass(footerElements(multiContact, "section"), "contact-locations").length, 1);
    assert.equal(footerWithClass(footerElements(multiAbout, "section"), "contact-locations").length, 0);
    assert.equal(footerWithClass(footerElements(multiLocations, "section"), "location-directory--visit-panel").length, 0);
    assert.equal(footerWithClass(footerElements(multiMenuChooser, "section"), "location-directory--visit-panel").length, 0);
    assert.ok(menuLinks(multiMenuChooser).length > 0, "The menu chooser retains location menu links.");

    const marketPanels = footerWithClass(footerElements(marketMenu, "section"), "location-directory--visit-panel");
    assert.equal(marketPanels.length, 1);
    const marketPanel = marketPanels[0];
    assert.ok(marketPanel);
    assert.ok(footerElements(marketPanel, "dl").length > 0, "The branch-scoped footer keeps its full hours.");
    assert.deepEqual(menuLinks(marketPanel), []);
    assert.deepEqual(
      footerElements(marketPanel, "h3").map(footerText).filter((heading) => heading !== "Regular Hours" && heading !== "Brunch Hours"),
      ["Market Street"],
    );
    await multi.cleanup();
  } finally {
    for (const key of envKeys) restoreEnv(key, previousEnv.get(key));
  }
});
