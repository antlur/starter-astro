import { defineConfig } from "@antlur/backstage";
import { pageLayoutDefinitions } from "../src/site/page-layout-definitions";

export default defineConfig({
  layouts: pageLayoutDefinitions,
});
