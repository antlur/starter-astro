import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Fixture builds resolve action from palette:primary instead of the declaration's #000 default.
for (const path of ["dist/index.html", "dist/about/index.html"]) {
  const html = readFileSync(path, "utf8");
  const root = html.match(/<html\b[^>]*>/i)?.[0];
  assert.match(root ?? "", /style="[^"]*--theme-color-action:\s*#294C3D/i, `${path} must contain the resolved CMS color on the document root.`);
  assert.doesNotMatch(root, /palette:|--brand-|--theme-font-|--ui-/);
  assert.doesNotMatch(root, /--theme-color-(?:background|topbar|foreground):/i, "Unsaved defaults must stay in CSS so semantic aliases remain live.");
}
console.log("Theme token CSS is present in built HTML.");
