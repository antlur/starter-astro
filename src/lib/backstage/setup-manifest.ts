import { readThemeTokenDeclarations } from "../../../backstage.theme-tokens";
import { pageLayoutDefinitions } from "../../layouts/definitions";
import { loadBlockManifests } from "./block-manifests";
import { createStarterSitePages } from "./site-initializer";
import { validateBlockManifests } from "./sync-blocks";

export function restaurantSetupManifest() {
  const blocks = validateBlockManifests(loadBlockManifests());
  const slugs = new Set(blocks.map(({ slug }) => slug));
  const pages = createStarterSitePages({ id: "", app_name: "" }, undefined, true).map((page) => ({
    title: page.title,
    slug: page.slug,
    is_home: page.is_home ?? false,
    blocks: page.blocks?.blocks.map(({ type, data }) => {
      if (!slugs.has(type)) throw new Error(`Starter page references an unknown block: ${type}`);
      return { type, data };
    }) ?? [],
  }));

  return {
    version: 1,
    template: "restaurant",
    blocks,
    layouts: pageLayoutDefinitions,
    // Manifest v1 importers are color-only; managed radius registers through the explicit SDK sync.
    theme_tokens: Object.fromEntries(Object.entries(readThemeTokenDeclarations()).filter(([, token]) => token.type === "color")),
    pages,
  };
}

export function serializeRestaurantSetupManifest() {
  return JSON.stringify(restaurantSetupManifest(), null, 2) + "\n";
}
