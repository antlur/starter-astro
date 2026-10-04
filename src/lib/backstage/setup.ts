import { listRegistryBlocks, type BackstageClient } from "@antlur/backstage";
import type { BlockManifest, BlockSyncClient } from "./sync-blocks";
import { syncBlockManifests } from "./sync-blocks";
import { safeLinkUrl } from "../safe-url";
import { planStarterSitePages, type StarterSitePagePlan } from "./site-initializer";

export type StarterSetupClient = BlockSyncClient & Pick<BackstageClient, "modules" | "website" | "pages" | "navigation" | "forms">;

export type StarterNavigationStatus = "configured" | "single" | "missing" | "selection-required" | "invalid" | "unknown";

export interface StarterSetupOptions {
  navigationId?: string;
  sdkRegistry?: readonly Pick<BlockManifest, "registry_identity">[];
}

export interface StarterSetupReport {
  websiteCount: number;
  websiteName: string | null;
  customBlocksEnabled: boolean;
  navigationCount: number | null;
  navigationStatus: StarterNavigationStatus;
  homepageExists: boolean | null;
  rootRouteExists: boolean | null;
  sdkRegistry: { registered: number; total: number; missingSlugs: string[] };
  socialProfileCount: number | null;
  websiteCtaConfigured: boolean | null;
  blockChanges: { created: number; updated: number } | null;
  warnings: string[];
}

export interface StarterSiteSetupReport {
  plan: StarterSitePagePlan | null;
  blockers: string[];
  warnings: string[];
}

export interface StarterSiteSetupOptions {
  contactFormId?: string;
  confirmContactFormRecipient?: boolean;
  sdkRegistry?: readonly Pick<BlockManifest, "registry_identity">[];
}

export function missingStarterBlockSlugs(
  manifests: readonly Pick<BlockManifest, "registry_identity" | "slug">[],
  sdkRegistry: readonly Pick<BlockManifest, "registry_identity">[] = listRegistryBlocks(),
): string[] {
  const registryIdentities = new Set(sdkRegistry.map((block) => block.registry_identity));
  return manifests.filter((manifest) => !registryIdentities.has(manifest.registry_identity)).map(({ slug }) => slug);
}

export function assertStarterBlockRegistryComplete(
  manifests: readonly Pick<BlockManifest, "registry_identity" | "slug">[],
  sdkRegistry: readonly Pick<BlockManifest, "registry_identity">[] = listRegistryBlocks(),
): void {
  const missing = missingStarterBlockSlugs(manifests, sdkRegistry);
  if (missing.length > 0) {
    throw new Error(`The installed SDK registry is missing Starter block contracts: ${missing.join(", ")}. Use an SDK release that includes the complete Starter registry before syncing.`);
  }
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
  const registryBlocks = options.sdkRegistry ?? listRegistryBlocks();
  const missingRegistrySlugs = missingStarterBlockSlugs(manifests, registryBlocks);
  const socialProfileCount = websites.length === 1
    ? (Array.isArray(websites[0].social_links)
      ? websites[0].social_links.filter((link) => safeLinkUrl(link.url)?.startsWith("https://")).length
      : 0)
    : null;
  const websiteCtaConfigured = websites.length === 1
    ? Boolean(websites[0].home_cta_text?.trim() && safeLinkUrl(websites[0].home_cta_url))
    : null;
  let homepageExists: boolean | null = null;
  let rootRouteExists: boolean | null = null;
  let navigationStatus: StarterNavigationStatus = "unknown";

  warnings.push("Confirm Headless application and Application owned routing in Backstage Settings; the SDK does not expose these setting values.");

  if (missingRegistrySlugs.length > 0) {
    warnings.push(
      `The installed SDK registry is missing Starter block contracts: ${missingRegistrySlugs.join(", ")}. ` +
      "Use an SDK release that includes the complete Starter registry before treating a fresh account as ready.",
    );
  }

  if (socialProfileCount === 0) {
    warnings.push("No valid HTTPS social profile URLs are configured; the shared footer intentionally hides social icons until they are added in Backstage.");
  }

  if (websiteCtaConfigured === false) {
    warnings.push("No website-level CTA is configured; this is optional when a navigation item is styled as a button.");
  }

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
    sdkRegistry: {
      registered: manifests.length - missingRegistrySlugs.length,
      total: manifests.length,
      missingSlugs: missingRegistrySlugs,
    },
    socialProfileCount,
    websiteCtaConfigured,
    blockChanges,
    warnings,
  };
}

export async function inspectStarterSiteSetup(
  client: StarterSetupClient,
  manifests: BlockManifest[],
  options: StarterSiteSetupOptions = {},
): Promise<StarterSiteSetupReport> {
  const [websites, customBlocksEnabled] = await Promise.all([
    client.website.getWebsites(),
    client.modules.isEnabled("cms.custom_blocks"),
  ]);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(websites) || websites.length !== 1) {
    return {
      plan: null,
      blockers: [`Starter site setup requires exactly one website; found ${Array.isArray(websites) ? websites.length : "an invalid response"}.`],
      warnings,
    };
  }

  if (!customBlocksEnabled) blockers.push("Enable CMS Custom Blocks before applying starter pages.");

  const registry = options.sdkRegistry ?? listRegistryBlocks();
  const missingRegistry = missingStarterBlockSlugs(manifests, registry);
  if (missingRegistry.length > 0) {
    blockers.push(`The installed SDK registry is missing Starter contracts: ${missingRegistry.join(", ")}.`);
  }

  const website = websites[0];
  const [pages, routes] = await Promise.all([
    client.pages.getHeadlessPages(),
    client.website.getWebsiteRoutes(website.id),
  ]);
  let contactFormId: string | undefined;

  if (options.contactFormId && !options.confirmContactFormRecipient) {
    warnings.push("Contact page was omitted. Verify the selected form's fields, recipient, and spam/security settings, then rerun with --confirm-contact-form-recipient.");
  } else if (options.contactFormId) {
    const form = await client.forms.getFormDefinition(options.contactFormId);
    if (form.id !== options.contactFormId) {
      blockers.push("The selected Contact Form response did not match the requested form ID.");
    } else if (!Array.isArray(form.fields) || form.fields.length === 0) {
      blockers.push("The selected Contact Form has no configured fields; configure the form in Backstage before applying starter pages.");
    } else {
      contactFormId = form.id;
      warnings.push("The selected form's recipient and delivery behavior cannot be verified by the Starter API check.");
    }
  }

  const plan = planStarterSitePages(website, pages, routes, contactFormId);
  warnings.push(...plan.warnings);
  if (!plan.canApply) blockers.push("A starter page path is already claimed by a route that is not represented by a CMS page.");

  return { plan, blockers, warnings };
}
