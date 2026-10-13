import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("Wrangler serves Astro static output with native trailing-slash and 404 handling", () => {
  assert.equal(config.name, "starter-astro");
  assert.equal(config.assets.directory, "./dist");
  assert.equal(config.assets.html_handling, "auto-trailing-slash");
  assert.equal(config.assets.not_found_handling, "none");
  assert.equal(config.main, undefined);
  assert.equal(config.account_id, undefined);
  assert.equal(config.zone_id, undefined);
  assert.equal(config.assets.binding, undefined);
});
