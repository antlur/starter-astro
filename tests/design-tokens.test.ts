import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("global styles wire Tailwind utilities and all three token layers without Preflight", async () => {
  const stylesheet = await readSource("../src/styles/global.css");

  assert.match(stylesheet, /tailwindcss\/theme\.css/);
  assert.match(stylesheet, /tailwindcss\/utilities\.css/);
  assert.doesNotMatch(stylesheet, /tailwindcss\/preflight\.css/);
  assert.match(stylesheet, /tokens\/brand\.css/);
  assert.match(stylesheet, /tokens\/theme\.css/);
  assert.match(stylesheet, /tokens\/ui\.css/);
});

test("brand, semantic theme, and UI tokens retain distinct ownership", async () => {
  const [brand, theme, ui, layout] = await Promise.all([
    readSource("../src/styles/tokens/brand.css"),
    readSource("../src/styles/tokens/theme.css"),
    readSource("../src/styles/tokens/ui.css"),
    readSource("../src/layouts/SiteLayout.astro"),
  ]);

  assert.match(brand, /--brand-color-primary/);
  assert.match(brand, /--brand-font-display/);
  assert.doesNotMatch(brand, /--(?:theme|ui)-/);
  assert.match(theme, /--theme-color-background/);
  assert.match(theme, /--theme-color-action:\s*var\(--brand-color-primary\)/);
  assert.match(theme, /--theme-color-focus:\s*var\(--brand-color-accent\)/);
  assert.match(theme, /@theme inline/);
  assert.match(theme, /--color-foreground:\s*var\(--theme-color-foreground\)/);
  assert.match(theme, /--color-focus:\s*var\(--theme-color-focus\)/);
  assert.match(await readSource("../src/styles/global.css"), /--color-ink:\s*var\(--theme-color-foreground\)/);
  assert.match(ui, /--ui-container-width/);
  assert.match(ui, /--ui-page-gutter/);
  assert.match(ui, /--ui-radius-md/);
  assert.match(layout, /bg-background text-foreground font-body/);
});
