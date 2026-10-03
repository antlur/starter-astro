import type { BackstageClient } from "@antlur/backstage";
import type { BlockManifest, BlockSyncClient } from "./sync-blocks";
import { syncBlockManifests } from "./sync-blocks";

export type StarterSetupClient = BlockSyncClient & Pick<BackstageClient, "modules" | "website" | "pages">;

export interface StarterSetupReport {
  websiteCount: number;
  websiteName: string | null;
  customBlocksEnabled: boolean;
  homepageExists: boolean | null;
  rootRouteExists: boolean | null;
  blockChanges: { created: number; updated: number } | null;
  warnings: string[];
}

export async function inspectStarterSetup(
  client: StarterSetupClient,
  manifests: BlockManifest[],
): Promise<StarterSetupReport> {
  const [websites, customBlocksEnabled] = await Promise.all([
    client.website.getWebsites(),
    client.modules.isEnabled("cms.custom_blocks"),
  ]);
  if (!Array.isArray(websites)) throw new Error("Backstage returned an invalid websites collection.");
  const warnings: string[] = [];
  let homepageExists: boolean | null = null;
  let rootRouteExists: boolean | null = null;

  warnings.push("Confirm Headless application and Application owned routing in Backstage Settings; the SDK does not expose these setting values.");

  if (websites.length !== 1) {
    warnings.push(`This Starter expects exactly one Backstage website; this account has ${websites.length}.`);
  } else {
    try {
      const [pages, routes] = await Promise.all([
        client.pages.getHeadlessPages(),
        client.website.getWebsiteRoutes(websites[0].id),
      ]);
      homepageExists = pages.some((page) => page.is_home || page.pathname === "/" || page.slug === "/");
      rootRouteExists = routes.some((route) => route === "/");

      if (!homepageExists) warnings.push("No Home page is configured; create one in Backstage before an API-backed site build.");
      if (!rootRouteExists) warnings.push("The website route graph has no root route; verify its Home page and routing settings.");
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
    homepageExists,
    rootRouteExists,
    blockChanges,
    warnings,
  };
}
