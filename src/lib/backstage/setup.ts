import type { BackstageClient } from "@antlur/backstage";
import type { BlockManifest, BlockSyncClient } from "./sync-blocks";
import { syncBlockManifests } from "./sync-blocks";

export type StarterSetupClient = BlockSyncClient & Pick<BackstageClient, "modules" | "website" | "pages" | "navigation">;

export type StarterNavigationStatus = "configured" | "single" | "missing" | "selection-required" | "invalid" | "unknown";

export interface StarterSetupOptions {
  navigationId?: string;
}

export interface StarterSetupReport {
  websiteCount: number;
  websiteName: string | null;
  customBlocksEnabled: boolean;
  navigationCount: number | null;
  navigationStatus: StarterNavigationStatus;
  homepageExists: boolean | null;
  rootRouteExists: boolean | null;
  blockChanges: { created: number; updated: number } | null;
  warnings: string[];
}

export async function inspectStarterSetup(
  client: StarterSetupClient,
  manifests: BlockManifest[],
  options: StarterSetupOptions = {},
): Promise<StarterSetupReport> {
  const [websites, customBlocksEnabled, navigations] = await Promise.all([
    client.website.getWebsites(),
    client.modules.isEnabled("cms.custom_blocks"),
    client.navigation.list(),
  ]);
  if (!Array.isArray(websites)) throw new Error("Backstage returned an invalid websites collection.");
  if (!Array.isArray(navigations)) throw new Error("Backstage returned an invalid navigation collection.");
  const warnings: string[] = [];
  let homepageExists: boolean | null = null;
  let rootRouteExists: boolean | null = null;
  let navigationStatus: StarterNavigationStatus = "unknown";

  warnings.push("Confirm Headless application and Application owned routing in Backstage Settings; the SDK does not expose these setting values.");

  if (websites.length !== 1) {
    warnings.push(`This Starter expects exactly one Backstage website; this account has ${websites.length}.`);
  } else {
    const requestedNavigationId = options.navigationId?.trim() || websites[0].header_navigation_id || null;

    if (requestedNavigationId) {
      navigationStatus = navigations.some((navigation) => navigation.id === requestedNavigationId)
        ? "configured"
        : "invalid";

      if (navigationStatus === "invalid") {
        warnings.push("The selected header navigation was not found in this account; verify BACKSTAGE_NAVIGATION_ID or the website's Header Navigation setting.");
      }
    } else if (navigations.length === 0) {
      navigationStatus = "missing";
      warnings.push("No saved navigation is configured; the site will show no page links until one is created in Backstage.");
    } else if (navigations.length === 1) {
      navigationStatus = "single";
    } else {
      navigationStatus = "selection-required";
      warnings.push("This account has multiple navigations but none is selected; set BACKSTAGE_NAVIGATION_ID or choose a Header Navigation in Backstage.");
    }

    try {
      const [pages, routes] = await Promise.all([
        client.pages.getHeadlessPages(),
        client.website.getWebsiteRoutes(websites[0].id),
      ]);
      const unsupportedBlockTypes = [...new Set(pages.flatMap((page) => page.blocks.map((block) => block.type)))]
        .filter((type) => !manifests.some((manifest) => manifest.slug === type));
      homepageExists = pages.some((page) => page.is_home || page.pathname === "/" || page.slug === "/");
      rootRouteExists = routes.some((route) => route === "/");

      if (!homepageExists) warnings.push("No Home page is configured; create one in Backstage before an API-backed site build.");
      if (!rootRouteExists) warnings.push("The website route graph has no root route; verify its Home page and routing settings.");
      if (unsupportedBlockTypes.length > 0) {
        warnings.push(`Pages use block types without a local Starter manifest/renderer: ${unsupportedBlockTypes.join(", ")}. Add support before building.`);
      }
    } catch {
      warnings.push("Could not verify Headless pages and routes; confirm Headless rendering and Application owned routing in Backstage.");
    }
  }

  if (!customBlocksEnabled) {
    warnings.push("Enable the CMS Custom Blocks module in Backstage before syncing Starter block definitions.");
  }

  const blockChanges = customBlocksEnabled
    ? await syncBlockManifests(client, manifests, { dryRun: true })
    : null;

  return {
    websiteCount: websites.length,
    websiteName: websites.length === 1 ? websites[0].app_name : null,
    customBlocksEnabled,
    navigationCount: websites.length === 1 ? navigations.length : null,
    navigationStatus,
    homepageExists,
    rootRouteExists,
    blockChanges,
    warnings,
  };
}
