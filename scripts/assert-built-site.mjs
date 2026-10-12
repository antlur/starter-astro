import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

if (process.argv[2] !== "preview") {
  throw new Error("Pass 'preview' to verify the fixture preview build.");
}

const html = readFileSync("dist/locations/fieldwork/seasonal-menu/index.html", "utf8");
const image = html.match(/<img\b[^>]*class="menu-item__image"[^>]*>/)?.[0];

assert.match(html, /Seasonal menu/, "The route-resolved menu page should be generated.");
assert.ok(image, "The route-resolved menu image should be present in generated HTML.");
assert.match(image, /src="https:\/\/images\.example\.test\/roasted-tomato-tartine\.jpg"/);
assert.match(image, /alt="Roasted tomato tartine on toast"/);
assert.match(image, /\bwidth="960"/);
assert.match(image, /\bheight="640"/);

console.log("Built route-resolved menu includes its image, alt text, and dimensions.");
