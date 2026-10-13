import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build } from "astro";

const root = fileURLToPath(new URL("../", import.meta.url));

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
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, "the page should have one primary heading");
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
  } finally {
    for (const key of envKeys) restoreEnv(key, previousEnv.get(key));
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
