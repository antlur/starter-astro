import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = process.argv[2] ?? "local";
assert.ok(source === "local" || source === "backstage", "Expected local or backstage design source.");

for (const path of ["dist/index.html", "dist/about/index.html"]) {
  const html = readFileSync(path, "utf8");
  const root = html.match(/<html\b[^>]*>/i)?.[0];
  assert.ok(root);
  if (source === "local") {
    assert.doesNotMatch(root, /--(?:brand|theme|ui)-/, `${path} must leave local CSS defaults in control.`);
  } else {
    assert.match(root, /--brand-color-primary:\s*#294C3D/i, `${path} must contain the resolved Brand color.`);
    assert.match(root, /--brand-font-display:/, `${path} must contain the configured Brand font family.`);
    assert.match(root, /--theme-color-action:\s*#294C3D/i, `${path} must contain the saved Theme override.`);
  }
  assert.doesNotMatch(root, /palette:|--theme-font-|--ui-/);
  assert.doesNotMatch(root, /--theme-color-(?:background|topbar|foreground):/i, "Unsaved defaults must stay in CSS so semantic aliases remain live.");
}
console.log(`${source} design token output checks passed.`);
