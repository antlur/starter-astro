import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readLayout = () => readFile(new URL("../src/layouts/SiteLayout.astro", import.meta.url), "utf8");
const readGlobalStyles = () => readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");

test("directions link derives its accessible name from the visible address", async () => {
  const layout = await readLayout();
  const link = layout.match(/<a class="site-topbar__address"[^>]*>/)?.[0];

  assert.ok(link);
  assert.doesNotMatch(link, /aria-label=/);
});

test("mobile action is contained in the footer landmark", async () => {
  const layout = await readLayout();
  const footerStart = layout.indexOf('<footer class="site-footer">');
  const action = layout.indexOf('class="site-mobile-action"');
  const footerEnd = layout.indexOf("</footer>", footerStart);

  assert.ok(footerStart >= 0 && footerStart < action && action < footerEnd);
});

test("header focus indicators use the configured header foreground", async () => {
  const styles = await readGlobalStyles();

  assert.match(
    styles,
    /\.site-header-shell a:focus-visible,\s*\.site-header-shell button:focus-visible\s*\{[^}]*outline-color:\s*var\(--color-header-foreground\)/s,
  );
});
