import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateThemeTokenDeclarations } from "@antlur/backstage";
import { brandTokenNames, readThemeTokenDeclarations } from "../backstage.theme-tokens";
import { normalizeWebsite } from "../src/lib/backstage/content";
import { brandTokenNamesFromCss, resolveWebsiteDesignTokens, resolveWebsiteThemeTokens, themeDeclarationsFromCss } from "../src/lib/backstage/theme-tokens";

const backstageDesign = { designTokens: { source: "backstage" as const } };
const themeTokenDeclarations = readThemeTokenDeclarations();
const resolveDesign = (payload: unknown) => resolveWebsiteDesignTokens(payload, backstageDesign, brandTokenNames, readThemeTokenDeclarations);

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
  assert.deepEqual(Object.entries(tokens).filter(([, declaration]) => declaration.type !== "color"), [
    ["button-radius", { label: "Button Radius", type: "radius", cssVariable: "--theme-radius-button", default: "6px" }],
  ]);
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

test("CSS-derived declarations use the published SDK contract and its size limits", () => {
  assert.deepEqual(validateThemeTokenDeclarations(themeTokenDeclarations), themeTokenDeclarations);
  const tooMany = Array.from({ length: 129 }, (_, index) => `--theme-color-color-${index}: #fff;`).join(" ");
  assert.throws(() => themeDeclarationsFromCss(`:root { ${tooMany} }`), /at most 128/);
});

test("button radius accepts only bounded pixels and the pill preset in Backstage design mode", () => {
  const declaration = themeTokenDeclarations["button-radius"];
  const payload = (value: unknown, remote: unknown = declaration) => ({
    theme_tokens: {
      tokens: { action: token, "button-radius": remote },
      values: { action: "#123", "button-radius": value },
    },
  });
  for (const value of ["0px", "6px", "21px", "32px", "pill"]) {
    assert.deepEqual(resolveDesign(payload(value)), {
      "--theme-color-action": "#112233",
      "--theme-radius-button": value === "pill" ? "9999px" : value,
    });
    assert.deepEqual(normalizeWebsite(payload(value)).themeVariables, {});
  }
  for (const value of [undefined, "", null, 0, "33px", "1.5px", "6rem", "9999px", "0px;display:none", "palette:primary"]) {
    assert.deepEqual(resolveDesign(payload(value)), { "--theme-color-action": "#112233" });
  }
  for (const remote of [null, { ...declaration, type: "color" }, { ...declaration, cssVariable: "--theme-radius-card" }]) {
    assert.deepEqual(resolveDesign(payload("12px", remote)), { "--theme-color-action": "#112233" });
  }
  assert.equal(themeDeclarationsFromCss(":root { --theme-color-action: #fff; --theme-radius-button: 9999px; }")["button-radius"].default, "pill");
  assert.throws(() => themeDeclarationsFromCss(":root { --theme-color-action: #fff; --theme-radius-button: 99px; }"), /button radius/);
});

test("build resolves saved hex colors and palette tokens, including legacy palette names", () => {
  assert.deepEqual(resolveWebsiteThemeTokens(website("#123")), { "--theme-color-action": "#112233" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:primary", [{ token: "primary", name: "Brand", value: "#123456" } ])), { "--theme-color-action": "#123456" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:Brand Blue", [{ name: "Brand Blue", value: "#def" } ])), { "--theme-color-action": "#DDEEFF" });
  assert.deepEqual(normalizeWebsite(website("#fff"), backstageDesign).themeVariables, { "--theme-color-action": "#FFFFFF" });
});

test("removed palette colors, cleared overrides, and invalid values fall back to declaration defaults", () => {
  for (const value of [undefined, null, "", "palette:missing", "red", "#fff;display:none", "url(https://example.test)"]) {
    assert.deepEqual(resolveWebsiteThemeTokens(website(value)), { "--theme-color-action": "#AABBCC" });
  }
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:primary", [{ token: "primary", value: "url(evil)" }])), { "--theme-color-action": "#AABBCC" });
});

test("static builds emit only valid saved overrides and leave current CSS defaults and aliases intact", () => {
  for (const value of [undefined, null, "", "palette:missing", "red", "#fff;display:none"]) {
    assert.deepEqual(resolveWebsiteThemeTokens(website(value), themeTokenDeclarations), {});
    assert.deepEqual(normalizeWebsite(website(value), backstageDesign).themeVariables, {});
  }
  assert.deepEqual(resolveWebsiteThemeTokens(website("#123"), themeTokenDeclarations), { "--theme-color-action": "#112233" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:primary", [{ token: "primary", value: "#123456" }]), themeTokenDeclarations), { "--theme-color-action": "#123456" });
  assert.deepEqual(resolveWebsiteThemeTokens(website("palette:Brand Blue", [{ name: "Brand Blue", value: "#def" }]), themeTokenDeclarations), { "--theme-color-action": "#DDEEFF" });
  const background = {
    theme_tokens: {
      tokens: themeTokenDeclarations,
      values: { background: "#123456" },
    },
  };
  assert.deepEqual(normalizeWebsite(background, backstageDesign).themeVariables, { "--theme-color-background": "#123456" });
});

test("the active site rejects stale token keys and remote attempts to retarget local declarations", () => {
  for (const tokens of [
    { removed: { ...token, cssVariable: "--theme-color-removed" } },
    { action: { ...token, cssVariable: "--theme-color-background" } },
    { action: { ...token, cssVariable: "--brand-color-primary" } },
    { action: { ...token, type: "font" } },
  ]) {
    const payload = { theme_tokens: { tokens, values: { action: "#fff", removed: "#000" } } };
    assert.deepEqual(resolveWebsiteThemeTokens(payload, themeTokenDeclarations), {});
    assert.deepEqual(normalizeWebsite(payload, backstageDesign).themeVariables, {});
  }
});

test("local and omitted design sources ignore remote Brand and Theme without reading their properties", () => {
  const payload = { get theme() { throw new Error("Local mode must not read remote design."); } };
  for (const config of [{}, { designTokens: {} }, { designTokens: { source: "local" as const } }]) {
    assert.deepEqual(resolveWebsiteDesignTokens(payload, config, brandTokenNames, () => { throw new Error("Local CSS must not be validated against the CMS color contract."); }), {});
  }
  assert.deepEqual(normalizeWebsite(website("#fff")).themeVariables, {});
});

test("Backstage mode pulls explicit Brand colors and fonts even without theme declarations", () => {
  const payload = {
    theme: { colors: { primary: "#ff0000", palette: [{ token: "primary", value: "#123" }, { name: "Secondary", value: "#abc" }] } },
    font_families: [{ name: "display", value: '"Example Serif", Georgia, serif' }, { name: "body", value: "Arial, sans-serif" }],
  };
  const expected = {
    "--brand-color-primary": "#112233", "--brand-color-secondary": "#AABBCC",
    "--brand-font-display": '"Example Serif", Georgia, serif', "--brand-font-body": "Arial, sans-serif",
  };
  assert.deepEqual(resolveDesign(payload), expected);
  assert.deepEqual(normalizeWebsite(payload, backstageDesign).themeVariables, expected);
  assert.deepEqual(resolveDesign({ theme: { colors: { primary: "#ff0000" } } }), {});
});

test("Brand fills local slots while saved semantic overrides win and unsaved aliases remain in CSS", () => {
  const payload = { ...website("#456"), theme: { colors: { palette: [{ token: "primary", value: "#123" }] } } };
  assert.deepEqual(resolveDesign(payload), { "--brand-color-primary": "#112233", "--theme-color-action": "#445566" });
  assert.deepEqual(resolveDesign({ ...payload, theme_tokens: { ...payload.theme_tokens, values: {} } }), { "--brand-color-primary": "#112233" });
  assert.deepEqual(resolveDesign(website("palette:missing")), {});
});

test("Brand mappings are allowlisted by CSS, not palette order or arbitrary API property names", () => {
  assert.deepEqual(brandTokenNamesFromCss(":root { --brand-color-special: #abc; --brand-font-caption: serif; --ui-radius-sm: 1px; }"), ["--brand-color-special", "--brand-font-caption"]);
  const palette = [
    { name: "Primary", value: "#000" }, { token: "primary", value: "#123" }, { token: "primary", value: "#456" },
    { token: "unknown", value: "#fff" }, { token: "--ui-radius-sm", value: "#fff" }, { token: "bad;color", value: "#fff" },
  ];
  assert.deepEqual(resolveDesign({ theme: { colors: { palette } } }), { "--brand-color-primary": "#112233" });
  assert.deepEqual(resolveDesign({ font_families: [{ name: "--brand-font-display", value: "Georgia, serif" }, { name: "navigation", value: "Arial" }] }), { "--brand-font-display": "Georgia, serif" });
  assert.deepEqual(resolveDesign({ font_families: [{ name: "heading", value: "Georgia, serif" }] }), { "--brand-font-display": "Georgia, serif" });
});

test("invalid remote Brand values and malformed collections leave CSS defaults intact", () => {
  for (const value of [null, "", "red", "#fff;display:none", "url(evil)", "</style>"]) {
    assert.deepEqual(resolveDesign({ theme: { colors: { palette: [{ token: "primary", value }] } } }), {});
  }
  for (const value of [null, "", "inherit", "unset", "revert-layer", "Arial; color:red", "url(evil)", "var(--ui-font)", "Arial/*bad*/", "Arial\nserif", '"Unclosed', "</style><script>bad</script>"]) {
    assert.deepEqual(resolveDesign({ font_families: [{ name: "body", value }] }), {});
  }
  for (const payload of [{}, { theme: null, font_families: {} }, { theme: { colors: { palette: [null, [], {}] } }, font_families: [null, [], {}] }]) assert.deepEqual(resolveDesign(payload), {});
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
