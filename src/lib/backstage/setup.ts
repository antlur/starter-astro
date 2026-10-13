import { listRegistryBlocks, parseBlockIdentity, validateBlockManifest, type BackstageClient } from "@antlur/backstage";
import { assertPageBlockDefinitions, assertPageLayoutDefinitions, normalizePage, type HeadlessPage } from "./content";
import type { BlockManifest, BlockSyncClient, BlockSyncResult } from "./sync-blocks";
import { syncBlockManifests, validateBlockManifests } from "./sync-blocks";
import { safeLinkUrl, safeSiteLinkUrl } from "../safe-url";
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
  blockChanges: BlockSyncResult | null;
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

export interface StarterReadinessReport {
  websiteName: string | null;
  blockers: string[];
  warnings: string[];
  manualGates: string[];
}

export function formatStarterReadinessReport(report: StarterReadinessReport): string {
  const section = (title: string, items: string[]) => [title, ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"])];

  return [
    `Automated readiness: ${report.blockers.length === 0 ? "READY" : "BLOCKED"}${report.websiteName ? ` (${report.websiteName})` : ""}`,
    ...section("Blockers:", report.blockers),
    ...section("Warnings:", report.warnings),
    ...section("Manual launch gates (not verified by this command):", report.manualGates),
    "A READY result covers only the automated account checks above; it is not production launch approval.",
  ].join("\n");
}

export function starterReadinessExitCode(report: Pick<StarterReadinessReport, "blockers">): 0 | 1 {
  return report.blockers.length === 0 ? 0 : 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export function missingStarterBlockSlugs(
  manifests: readonly Pick<BlockManifest, "registry_identity" | "slug">[],
  sdkRegistry: readonly Pick<BlockManifest, "registry_identity">[] = listRegistryBlocks(),
): string[] {
  const registryIdentities = new Set(sdkRegistry.map((block) => block.registry_identity));
  return manifests
    .filter((manifest) => parseBlockIdentity(manifest.registry_identity).namespace === "starter-astro")
    .filter((manifest) => !registryIdentities.has(manifest.registry_identity))
    .map(({ slug }) => slug);
}

function validateStarterBlockManifests(manifests: readonly BlockManifest[]): void {
  for (const manifest of manifests) validateBlockManifest(manifest);
  validateBlockManifests([...manifests]);
}

export function assertStarterBlockRegistryComplete(
  manifests: readonly BlockManifest[],
  sdkRegistry: readonly Pick<BlockManifest, "registry_identity">[] = listRegistryBlocks(),
): void {
  validateStarterBlockManifests(manifests);
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
  validateStarterBlockManifests(manifests);
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
  const bundledManifests = manifests.filter(
    (manifest) => parseBlockIdentity(manifest.registry_identity).namespace === "starter-astro",
  );
  const socialProfileCount = websites.length === 1
    ? (Array.isArray(websites[0].social_links)
      ? websites[0].social_links.filter((link) => safeLinkUrl(link.url)?.startsWith("https://")).length
      : 0)
    : null;
  const websiteCtaConfigured = websites.length === 1
    ? Boolean(websites[0].home_cta_text?.trim() && safeSiteLinkUrl(websites[0].home_cta_url))
    : null;
  let homepageExists: boolean | null = null;
  let rootRouteExists: boolean | null = null;
  let navigationStatus: StarterNavigationStatus = "unknown";

  warnings.push("Confirm Headless rendering in Backstage Settings; the SDK does not expose this setting. The Starter uses Backstage's canonical route graph and does not require the legacy Application owned routing mode.");

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
      warnings.push("Could not verify Headless pages and routes; confirm Headless rendering and that the expected public routes are present in Backstage's canonical site graph.");
    }
  }

  if (!customBlocksEnabled) {
    warnings.push("Enable the CMS Custom Blocks module in Backstage before syncing Starter block definitions.");
  }

  const blockChanges = customBlocksEnabled
    ? await syncBlockManifests(client, manifests, { dryRun: true })
    : null;
  if (blockChanges?.warnings) warnings.push(...blockChanges.warnings);

  return {
    websiteCount: websites.length,
    websiteName: websites.length === 1 ? websites[0].app_name : null,
    customBlocksEnabled,
    navigationCount: websites.length === 1 ? navigations.length : null,
    navigationStatus,
    homepageExists,
    rootRouteExists,
    sdkRegistry: {
      registered: bundledManifests.length - missingRegistrySlugs.length,
      total: bundledManifests.length,
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
  validateStarterBlockManifests(manifests);
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

export async function inspectStarterReadiness(
  client: StarterSetupClient,
  manifests: BlockManifest[],
  options: StarterSetupOptions = {},
): Promise<StarterReadinessReport> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const manualGates = [
    "Confirm Headless rendering is selected in Backstage Settings; the current SDK does not expose the rendering mode.",
    "Review branding, SEO metadata, media, and content completeness manually; the setup APIs cannot certify these for launch.",
    "Validate the deployed domain, canonical URLs, and hosting behavior before launch; these are outside the account setup API.",
  ];

  let setup: StarterSetupReport;
  try {
    setup = await inspectStarterSetup(client, manifests, options);
  } catch (error) {
    return {
      websiteName: null,
      blockers: [`Could not verify the Backstage setup response: ${errorMessage(error)}`],
      warnings,
      manualGates,
    };
  }

  const websiteName = setup.websiteName;
  if (setup.websiteCount !== 1) {
    blockers.push(`This Starter requires exactly one Backstage website; found ${setup.websiteCount}.`);
  }
  if (!setup.customBlocksEnabled) {
    blockers.push("Enable the CMS Custom Blocks module in Backstage before building this site.");
  }
  if (setup.sdkRegistry.missingSlugs.length > 0) {
    blockers.push(
      `The installed SDK is missing Starter block contracts: ${setup.sdkRegistry.missingSlugs.join(", ")}. ` +
      "Install an SDK release that contains the complete Starter registry.",
    );
  }
  if (setup.blockChanges && (setup.blockChanges.created > 0 || setup.blockChanges.updated > 0)) {
    blockers.push(
      `Starter block definitions are out of sync (${setup.blockChanges.created} to create, ${setup.blockChanges.updated} to update). ` +
      "Review the setup preview, then run npm run setup -- --apply to sync them.",
    );
  }

  if (setup.homepageExists === false) blockers.push("Create or designate a Home page in Backstage before building.");
  if (setup.rootRouteExists === false) blockers.push("The Backstage route graph has no root route; fix the Home page or route configuration before building.");
  if (setup.homepageExists === null || setup.rootRouteExists === null) {
    blockers.push("Could not verify the Home page and root route from Backstage; check API access and the page response, then rerun readiness.");
  }
  const unsupportedBlockWarning = setup.warnings.find((warning) => warning.includes("block types without a local Starter manifest/renderer"));
  if (unsupportedBlockWarning) blockers.push(unsupportedBlockWarning);

  switch (setup.navigationStatus) {
    case "configured":
    case "single":
      break;
    case "missing":
      blockers.push("Create a navigation in Backstage before launch; the site currently has no page links.");
      break;
    case "selection-required":
      blockers.push("Select a Header Navigation in Backstage or set BACKSTAGE_NAVIGATION_ID.");
      break;
    case "invalid":
      blockers.push("The selected Header Navigation was not found; update BACKSTAGE_NAVIGATION_ID or the website setting.");
      break;
    case "unknown":
      if (setup.websiteCount === 1) blockers.push("Could not verify the account navigation selection; check API access and rerun readiness.");
      break;
  }

  const handledSetupWarnings = [
    "Confirm Headless rendering",
    "exactly one Backstage website",
    "installed SDK registry is missing Starter block contracts",
    "No Home page is configured",
    "route graph has no root route",
    "block types without a local Starter manifest/renderer",
    "No saved navigation is configured",
    "multiple navigations but none is selected",
    "selected header navigation was not found",
    "Enable the CMS Custom Blocks module",
    "Could not verify Headless pages and routes",
  ];
  warnings.push(...setup.warnings.filter((warning) => !handledSetupWarnings.some((fragment) => warning.includes(fragment))));

  let pages: HeadlessPage[] | null = null;
  if (setup.websiteCount === 1) {
    try {
      const response = await client.pages.getHeadlessPages();
      if (!Array.isArray(response)) throw new Error("Backstage returned an invalid pages collection.");
      pages = response.map(normalizePage);
    } catch (error) {
      blockers.push(`Could not validate Headless pages: ${errorMessage(error)}`);
    }
  }

  if (pages) {
    if (pages.some((page) => page.blocks.length > 0) && setup.customBlocksEnabled) {
      try {
        const definitions = await client.blocks.list();
        if (!Array.isArray(definitions)) throw new Error("Backstage returned an invalid Custom Blocks collection.");
        assertPageBlockDefinitions(pages, true, definitions, manifests);
      } catch (error) {
        blockers.push(`Page block definitions are not ready: ${errorMessage(error)}`);
      }
    }

    if (pages.some((page) => page.layout !== null)) {
      try {
        const customLayoutsEnabled = await client.modules.isEnabled("cms.custom_layouts");
        assertPageLayoutDefinitions(pages, customLayoutsEnabled);
      } catch (error) {
        blockers.push(`Assigned page layouts are not ready: ${errorMessage(error)}`);
      }
    }

    if (pages.some((page) => page.blocks.some((block) => block.type === "contact-form"))) {
      manualGates.push("Submit a test contact form and verify its recipient, reCAPTCHA, spam handling, and delivery; the setup API cannot verify end-to-end email delivery.");
    }
  }

  return { websiteName, blockers, warnings, manualGates };
}
