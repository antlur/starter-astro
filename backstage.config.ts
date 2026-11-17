import { defineConfig } from "@antlur/backstage";
import { themeTokenDeclarations } from "./backstage.theme-tokens";
import { pageLayoutDefinitions } from "./src/layouts/definitions";

// Keep the config compatible with older SDK reads; declaration sync requires the new CLI.
const config = {
  blockManifestDirectory: "src/blocks",
  layouts: pageLayoutDefinitions,
  themeTokens: themeTokenDeclarations,
};

export default defineConfig(config);
