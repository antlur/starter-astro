import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { themeDeclarationsFromCss } from "./src/lib/backstage/theme-tokens";

// Read by declaration sync and static builds; neither path writes the CSS defaults.
export const themeTokenDeclarations = themeDeclarationsFromCss(
  readFileSync(resolve(process.cwd(), "src/styles/tokens/brand.css"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/styles/tokens/theme.css"), "utf8"),
);
