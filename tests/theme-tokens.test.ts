import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWebsite } from "../src/lib/backstage/content";
import { resolveWebsiteThemeTokens, themeDeclarationsFromCss } from "../src/lib/backstage/theme-tokens";

const token = { label: "Action", type: "color", cssVariable: "--theme-color-action", default: "#abc" };
const website = (value?: unknown, palette: unknown[] = []) => ({
  theme: { colors: { palette } },
  theme_tokens: { tokens: { action: token }, values: { action: value } },
});

test("theme declarations derive defaults from the existing CSS and resolve brand and semantic aliases", () => {
  const brand = readFileSync(new URL("../src/styles/tokens/brand.css", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/styles/tokens/theme.css", import.meta.url), "utf8");
  const tokens = themeDeclarationsFromCss(brand, theme);
  assert.equal(tokens.action.default, "#294C3D");
  assert.equal(tokens["header-foreground"].default, "#FFFFFF");
  assert.equal(tokens["topbar-foreground"].default, tokens.foreground.default);
  assert.ok(Object.values(tokens).every((declaration) => declaration.type === "color"));
  assert.ok(!Object.keys(tokens).some((key) => key.includes("font")));
  assert.equal(brand, readFileSync(new URL("../src/styles/tokens/brand.css", import.meta.url), "utf8"));
});

test("unsupported CSS color expressions and broken references stop declaration sync before a write", () => {
  for (const css of [
    ":root { --theme-color-action: red; }",
    ":root { --theme-color-action: var(--missing); }",
    ":root { --theme-color-action: var(--theme-color-action); }",
  ]) assert.throws(() => themeDeclarationsFromCss(css), /hex color|cyclic/);
  assert.throws(() => themeDeclarationsFromCss(":root { --brand-font-body: serif; }"), /No semantic theme colors/);
});

test("build resolves saved hex colors and palette tokens, including legacy palette names", () => {
  assert.deepEqual(resolveWebsiteThemeTokens(website("#123")), { "--theme-color-action": "#112233" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:primary", [{ token: "primary", name: "Brand", value: "#123456" } ])), { "--theme-color-action": "#123456" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:Brand Blue", [{ name: "Brand Blue", value: "#def" } ])), { "--theme-color-action": "#DDEEFF" });
  assert.deepEqual(normalizeWebsite(website("#fff")).themeVariables, { "--theme-color-action": "#FFFFFF" });
});

test("removed palette colors, cleared overrides, and invalid values fall back to declaration defaults", () => {
  for (const value of [undefined, null, "", "palette:missing", "red", "#fff;display:none", "url(https://example.test)"]) {
    assert.deepEqual(resolveWebsiteThemeTokens(website(value)), { "--theme-color-action": "#AABBCC" });
  }
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:primary", [{ token: "primary", value: "url(evil)" }])), { "--theme-color-action": "#AABBCC" });
});

test("sites without declarations retain their CSS defaults and orphan overrides do not create variables", () => {
  assert.deepEqual(resolveWebsiteThemeTokens({}), {});
  assert.deepEqual(resolveWebsiteThemeTokens({ theme_tokens: { tokens: {}, values: { removed: "#fff" } } }), {});
  assert.deepEqual(resolveWebsiteThemeTokens({ theme_tokens: { tokens: [] } }), {});
});

test("malformed declarations cannot inject CSS or override site-owned brand, font, and interface properties", () => {
  for (const patch of [
    { cssVariable: "--brand-color-primary" }, { cssVariable: "--theme-font-body" },
    { cssVariable: "--ui-radius-md" }, { cssVariable: "--theme-color-action;color:red" },
    { default: "</style><script>bad</script>" }, { type: "font" },
  ]) {
    assert.deepEqual(resolveWebsiteThemeTokens({ theme_tokens: { tokens: { action: { ...token, ...patch } }, values: {} } }), {});
  }
});
