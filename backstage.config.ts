import { defineConfig } from "@antlur/backstage";
import { themeTokenDeclarations } from "./backstage.theme-tokens";
import { pageLayoutDefinitions } from "./src/layouts/definitions";

export default defineConfig({
  blockManifestDirectory: "src/blocks",
  layouts: pageLayoutDefinitions,
  themeTokens: themeTokenDeclarations,
});
