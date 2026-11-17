import { resolveDesignTokenSource, validateThemeTokenDeclarations, type ColorThemeToken, type ThemeTokenDeclarations } from "@antlur/backstage";
import type { BackstageUserConfig } from "@antlur/backstage/config";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hex(value: unknown): `#${string}` | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (/^#[a-f0-9]{6}$/i.test(color)) return color.toUpperCase() as `#${string}`;
  if (/^#[a-f0-9]{3}$/i.test(color)) {
    return ("#" + [...color.slice(1)].map((digit) => digit + digit).join("")).toUpperCase() as `#${string}`;
  }
  return null;
}

function rootPropertiesFromCss(stylesheets: string[]): Map<string, string> {
  const properties = new Map<string, string>();
  for (const stylesheet of stylesheets) {
    const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const root of css.matchAll(/:root\s*\{([^}]+)\}/g)) {
      for (const property of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        properties.set(property[1], property[2].trim());
      }
    }
  }
  return properties;
}

export function brandTokenNamesFromCss(stylesheet: string): string[] {
  return [...rootPropertiesFromCss([stylesheet]).keys()].filter((name) => /^--brand-(?:color|font)-[a-z][a-z0-9-]*$/.test(name));
}

/** Explicit sync derives declarations from the canonical CSS; it never writes CSS files. */
export function themeDeclarationsFromCss(...stylesheets: string[]): ThemeTokenDeclarations {
  const properties = rootPropertiesFromCss(stylesheets);

  const resolve = (name: string, visited = new Set<string>()): `#${string}` => {
    if (visited.has(name)) throw new Error(`Theme color ${name} has a cyclic CSS reference.`);
    visited.add(name);
    const value = properties.get(name);
    const color = hex(value);
    if (color) return color;
    const reference = value?.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/)?.[1];
    if (reference) return resolve(reference, visited);
    throw new Error(`Theme color ${name} must resolve to a hex color before syncing.`);
  };

  const tokens: Record<string, ColorThemeToken> = {};
  for (const name of properties.keys()) {
    if (!name.startsWith("--theme-color-")) continue;
    const key = name.slice("--theme-color-".length);
    tokens[key] = {
      label: key.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
      type: "color",
      cssVariable: name as `--${string}`,
      default: resolve(name),
    };
  }
  if (Object.keys(tokens).length === 0) throw new Error("No semantic theme colors were found in the token CSS.");
  return validateThemeTokenDeclarations(tokens);
}

/** Read values from the website already fetched during the static build. */
export function resolveWebsiteThemeTokens(website: unknown, localDeclarations?: ThemeTokenDeclarations): Record<string, string> {
  if (!isRecord(website) || !isRecord(website.theme_tokens) || !isRecord(website.theme_tokens.tokens)) return {};
  const { tokens } = website.theme_tokens;
  const values = isRecord(website.theme_tokens.values) ? website.theme_tokens.values : {};
  const palette = isRecord(website.theme) && isRecord(website.theme.colors) && Array.isArray(website.theme.colors.palette)
    ? website.theme.colors.palette : [];
  const properties: Record<string, string> = {};

  for (const [key, token] of Object.entries(localDeclarations ?? tokens)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || !isRecord(token) || token.type !== "color"
      || typeof token.cssVariable !== "string" || !/^--theme-color-[a-z][a-z0-9-]*$/.test(token.cssVariable)) continue;
    const fallback = hex(token.default);
    if (!fallback) continue;
    // Local CSS owns the mapping. Ignore stale or remapped remote declarations.
    const remote = tokens[key];
    if (localDeclarations && (!isRecord(remote) || remote.type !== "color" || remote.cssVariable !== token.cssVariable)) continue;
    const value = values[key];
    let color = hex(value);
    if (typeof value === "string" && value.startsWith("palette:")) {
      const identifier = value.slice("palette:".length);
      const entry = palette.find((candidate) => isRecord(candidate) && (candidate.token ?? candidate.name) === identifier);
      color = isRecord(entry) ? hex(entry.value) : null;
    }
    // Do not flatten CSS aliases or pin old synced defaults onto the document root.
    if (color) properties[token.cssVariable] = color;
    else if (!localDeclarations) properties[token.cssVariable] = fallback;
  }
  return properties;
}

function fontStack(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  const families = value.trim().split(",").map((family) => family.trim());
  const familyName = /^(?:"[\p{L}\p{N} _-]+"|'[\p{L}\p{N} _-]+'|[\p{L}_-][\p{L}\p{N}_ -]*)$/u;
  if (!families.length || families.some((family) => !familyName.test(family) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(family))) return null;
  return families.join(", ");
}

/** Read the already-fetched website only; local design never applies remote values. */
export function resolveWebsiteDesignTokens(
  website: unknown,
  config: Pick<BackstageUserConfig, "designTokens">,
  brandNames: readonly string[],
  readThemeDeclarations: () => ThemeTokenDeclarations,
): Record<string, string> {
  if (resolveDesignTokenSource(config) === "local" || !isRecord(website)) return {};
  const allowed = new Set(brandNames);
  const properties: Record<string, string> = {};
  const palette = isRecord(website.theme) && isRecord(website.theme.colors) && Array.isArray(website.theme.colors.palette)
    ? website.theme.colors.palette.filter(isRecord) : [];
  // Explicit stable tokens take precedence over legacy display names, regardless of order.
  for (const entry of [...palette.filter((item) => item.token != null), ...palette.filter((item) => item.token == null)]) {
    const identifier = entry.token ?? (typeof entry.name === "string" ? entry.name.trim().toLowerCase().replace(/\s+/g, "-") : "");
    if (typeof identifier !== "string" || !/^[a-z][a-z0-9-]*$/.test(identifier)) continue;
    const name = `--brand-color-${identifier}`;
    const color = hex(entry.value);
    if (allowed.has(name) && color && properties[name] === undefined) properties[name] = color;
  }
  const fonts = Array.isArray(website.font_families) ? website.font_families.filter(isRecord) : [];
  for (const entry of fonts) {
    if (typeof entry.name !== "string") continue;
    const identifier = entry.name.trim();
    let name = identifier.startsWith("--brand-font-") ? identifier : `--brand-font-${identifier}`;
    if (identifier === "heading" && !allowed.has(name)) name = "--brand-font-display";
    const value = fontStack(entry.value);
    if (allowed.has(name) && value && properties[name] === undefined) properties[name] = value;
  }
  return { ...properties, ...resolveWebsiteThemeTokens(website, readThemeDeclarations()) };
}
