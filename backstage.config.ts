import { defineConfig } from "@antlur/backstage";
import { pageLayoutDefinitions } from "./src/layouts/definitions";

export default defineConfig({
  blockManifestDirectory: "src/blocks",
  layouts: pageLayoutDefinitions,
});
