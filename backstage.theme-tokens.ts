import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brandTokenNamesFromCss, themeDeclarationsFromCss } from "./src/lib/backstage/theme-tokens";

// Read by declaration sync and static builds; neither path writes the CSS defaults.
const brandCss = readFileSync(resolve(process.cwd(), "src/styles/tokens/brand.css"), "utf8");
export const brandTokenNames = brandTokenNamesFromCss(brandCss);
export const readThemeTokenDeclarations = () => themeDeclarationsFromCss(
  brandCss,
  readFileSync(resolve(process.cwd(), "src/styles/tokens/theme.css"), "utf8"),
);
