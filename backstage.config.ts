import { defineConfig, resolveDesignTokenSource, type DesignTokensConfig } from "@antlur/backstage";
import { readThemeTokenDeclarations } from "./backstage.theme-tokens";
import { pageLayoutDefinitions } from "./src/layouts/definitions";
import { isRestaurantProfile } from "./src/site/profile";

const designTokens: DesignTokensConfig = { source: isRestaurantProfile() ? "backstage" : "local" };

export default defineConfig({
  designTokens,
  blockManifestDirectory: "src/blocks",
  layouts: pageLayoutDefinitions,
  themeTokens: resolveDesignTokenSource({ designTokens }) === "backstage" ? readThemeTokenDeclarations() : undefined,
});
