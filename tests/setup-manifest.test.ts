import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { restaurantSetupManifest, serializeRestaurantSetupManifest } from "../src/lib/backstage/setup-manifest";

test("the published restaurant setup JSON matches its deterministic sources", () => {
  const checkedIn = readFileSync(new URL("../backstage.setup.json", import.meta.url), "utf8");
  assert.equal(serializeRestaurantSetupManifest(), checkedIn, "Run npm run export:setup after changing definitions.");
  assert.equal(serializeRestaurantSetupManifest(), checkedIn);
});

test("restaurant setup exports portable definitions and never installs a form or tenant IDs", () => {
  const manifest = restaurantSetupManifest();
  assert.ok(manifest.blocks.some(({ slug }) => slug === "locations"));
  assert.equal(manifest.layouts[0]?.slug, "starter-astro-standard-page");
  assert.ok(manifest.theme_tokens.action);
  assert.equal("button-radius" in manifest.theme_tokens, false, "setup manifest v1 remains color-only");
  assert.deepEqual(manifest.pages.map(({ slug, is_home }) => [slug, is_home]), [
    ["/", true], ["about", false], ["contact", false],
  ]);
  for (const page of manifest.pages) {
    assert.deepEqual(Object.keys(page), ["title", "slug", "is_home", "blocks"]);
    for (const block of page.blocks) {
      assert.deepEqual(Object.keys(block), ["type", "data"]);
      assert.ok(manifest.blocks.some(({ slug }) => slug === block.type));
      assert.notEqual(block.type, "contact-form");
    }
  }
});
