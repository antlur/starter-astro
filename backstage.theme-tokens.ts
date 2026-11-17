import { readFileSync } from "node:fs";
import { themeDeclarationsFromCss } from "./src/lib/backstage/theme-tokens";

// Defaults stay in CSS. This is read only by the explicitly invoked sync command.
export const themeTokenDeclarations = themeDeclarationsFromCss(
  readFileSync(new URL("./src/styles/tokens/brand.css", import.meta.url), "utf8"),
  readFileSync(new URL("./src/styles/tokens/theme.css", import.meta.url), "utf8"),
);
