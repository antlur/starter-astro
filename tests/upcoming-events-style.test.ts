import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("editorial lists keep the archive link with the section heading", () => {
  for (const [file, href] of [
    ["blocks/upcoming-events/UpcomingEvents.astro", "eventsIndexHref"],
    ["blocks/recent-press/RecentPress.astro", "pressIndexHref"],
  ]) {
    const header = source(file).match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header);
    assert.ok(header.includes(`<EditorialLink href={${href}} label={viewAllLabel} />`));
  }
});

test("featured editorial archive links have secondary styling and stay with the primary action", () => {
  const component = source("components/FeaturedEditorial.astro");
  assert.match(component, /class="featured-editorial__actions"[\s\S]*?viewAllHref && <EditorialLink[^>]*\/>[\s\S]*?<\/div>/);
  const textLink = source("components/EditorialLink.astro");
  assert.match(textLink, /<a class="editorial-link" href={href}>/);
  assert.match(textLink, /text-decoration: underline;/);
  assert.doesNotMatch(textLink, /background(?:-color)?:/);
});
