import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
const dist = resolve(root, config.assets.directory);

assert.ok(existsSync(join(dist, "index.html")), "The configured asset directory must contain the Astro home page.");
assert.ok(
  listFiles(dist).some((file) => file.endsWith(`${sep}index.html`)),
  "The configured asset directory must contain a nested Astro route index.",
);
console.log("Cloudflare static asset output checks passed.");

function listFiles(directory, parent = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = parent ? join(parent, entry.name) : entry.name;
    return entry.isDirectory() ? listFiles(join(directory, entry.name), relative) : [relative];
  });
}
