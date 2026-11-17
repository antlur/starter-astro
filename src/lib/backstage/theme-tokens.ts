export interface SiteColorToken {
  label: string;
  type: "color";
  cssVariable: `--${string}`;
  default: `#${string}`;
}

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

/** Explicit sync derives declarations from the canonical CSS; it never writes CSS files. */
export function themeDeclarationsFromCss(...stylesheets: string[]): Record<string, SiteColorToken> {
  const properties = new Map<string, string>();
  for (const stylesheet of stylesheets) {
    const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const root of css.matchAll(/:root\s*\{([^}]+)\}/g)) {
      for (const property of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        properties.set(property[1], property[2].trim());
      }
    }
  }

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

  const tokens: Record<string, SiteColorToken> = {};
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
  return tokens;
}

/** Read values from the website already fetched during the static build. */
export function resolveWebsiteThemeTokens(website: unknown): Record<string, string> {
  if (!isRecord(website) || !isRecord(website.theme_tokens) || !isRecord(website.theme_tokens.tokens)) return {};
  const { tokens } = website.theme_tokens;
  const values = isRecord(website.theme_tokens.values) ? website.theme_tokens.values : {};
  const palette = isRecord(website.theme) && isRecord(website.theme.colors) && Array.isArray(website.theme.colors.palette)
    ? website.theme.colors.palette : [];
  const properties: Record<string, string> = {};

  for (const [key, token] of Object.entries(tokens)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || !isRecord(token) || token.type !== "color"
      || typeof token.cssVariable !== "string" || !/^--theme-color-[a-z][a-z0-9-]*$/.test(token.cssVariable)) continue;
    const fallback = hex(token.default);
    if (!fallback) continue;
    const value = values[key];
    let color = hex(value);
    if (typeof value === "string" && value.startsWith("palette:")) {
      const identifier = value.slice("palette:".length);
      const entry = palette.find((candidate) => isRecord(candidate) && (candidate.token ?? candidate.name) === identifier);
      color = isRecord(entry) ? hex(entry.value) : null;
    }
    properties[token.cssVariable] = color ?? fallback;
  }
  return properties;
}
