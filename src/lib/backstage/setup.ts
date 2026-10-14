import { listRegistryBlocks, parseBlockIdentity, validateBlockManifest, type BackstageClient } from "@antlur/backstage";
import { buildSiteFromContent } from "../../site/build";
import {
  assertPageBlockDefinitions,
  assertPageLayoutDefinitions,
  getHomePage,
  normalizeNavigation,
  normalizePage,
  loadSiteContentForReadiness,
  type HeadlessPage,
  type SiteContentReadClient,
  type SiteNavigationItem,
} from "./content";
import { attachBackstageForms } from "./forms";
import type { BlockManifest, BlockSyncClient, BlockSyncResult } from "./sync-blocks";
import { syncBlockManifests, validateBlockManifests } from "./sync-blocks";
import { safeLinkUrl, safeSiteLinkUrl } from "../safe-url";
import { planStarterSitePages, type StarterSitePagePlan } from "./site-initializer";
import { normalizeRoutePath, pageForCanonicalRoute } from "../../site/routes";

export type StarterSetupClient = BlockSyncClient & SiteContentReadClient & Pick<BackstageClient, "routes" | "forms">;

export type StarterNavigationStatus =
  | "configured"
  | "single"
  | "missing"
  | "selection-required"
  | "invalid"
  | "empty"
  | "unreadable"
  | "unknown";

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
  rootRouteMatchesHome: boolean | null;
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

const flattenNavigation = (items: readonly SiteNavigationItem[]): SiteNavigationItem[] =>
  items.flatMap((item) => [item, ...flattenNavigation(item.children)]);

const usableNavigationItems = (items: readonly SiteNavigationItem[]): SiteNavigationItem[] =>
  flattenNavigation(items).filter((item) => Boolean(item.text.trim() && safeSiteLinkUrl(item.url)));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  let rootRouteMatchesHome: boolean | null = null;
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
    let selectedNavigationId: string | null = null;

    if (requestedNavigationId) {
      navigationStatus = navigations.some((navigation) => navigation.id === requestedNavigationId)
        ? "configured"
        : "invalid";

      if (navigationStatus === "invalid") {
        warnings.push("The selected header navigation was not found in this account; verify BACKSTAGE_NAVIGATION_ID or the website's Header Navigation setting.");
      } else {
        selectedNavigationId = requestedNavigationId;
      }
    } else if (navigations.length === 0) {
      navigationStatus = "missing";
      warnings.push("No saved navigation is configured; the site will show no page links until one is created in Backstage.");
    } else if (navigations.length === 1) {
      navigationStatus = "single";
      selectedNavigationId = navigations[0].id;
    } else {
      navigationStatus = "selection-required";
      warnings.push("This account has multiple navigations but none is selected; set BACKSTAGE_NAVIGATION_ID or choose a Header Navigation in Backstage.");
    }

    if (selectedNavigationId) {
      try {
        const selectedNavigation = normalizeNavigation(await client.navigation.getNavigation(selectedNavigationId));
        const usableLinks = usableNavigationItems(selectedNavigation);

        if (usableLinks.length === 0) {
          navigationStatus = "empty";
          warnings.push(`Selected header navigation "${selectedNavigationId}" contains no usable links after normalization.`);
        }
      } catch (error) {
        navigationStatus = "unreadable";
        warnings.push(`Could not read or normalize selected header navigation "${selectedNavigationId}": ${errorMessage(error)}`);
      }
    }

    try {
      const [pages, routes] = await Promise.all([
        client.pages.getHeadlessPages(),
        client.website.getWebsiteRoutes(websites[0].id),
      ]);
      if (!Array.isArray(pages)) throw new Error("Backstage returned an invalid pages collection.");
      if (!Array.isArray(routes)) throw new Error("Backstage returned an invalid website route collection.");
      const unsupportedBlockTypes = [...new Set(pages.flatMap((page) => page.blocks.map((block) => block.type)))]
        .filter((type) => !manifests.some((manifest) => manifest.slug === type));
      let homePage: HeadlessPage | null = null;
      try {
        homePage = getHomePage(pages);
        homepageExists = true;
      } catch (error) {
        homepageExists = false;
        warnings.push(errorMessage(error));
      }
      rootRouteExists = routes.map(normalizeRoutePath).includes("/");

      if (!rootRouteExists) warnings.push("The website route graph has no root route; verify its Home page and routing settings.");
      if (homePage && rootRouteExists) {
        try {
          const resolution: unknown = await client.routes.resolve("/");
          const meta = isRecord(resolution) && isRecord(resolution.meta) ? resolution.meta : null;
          const data = isRecord(resolution) && isRecord(resolution.data) ? resolution.data : null;
          const resolvedPage = pageForCanonicalRoute("/", resolution, [homePage]);
          rootRouteMatchesHome = resolvedPage?.id === homePage.id;

          if (!rootRouteMatchesHome) {
            const routeDescription = meta
              ? `type "${String(meta.type)}", ID "${String(data?.id ?? meta.id)}", path "${String(meta.path)}"`
              : "an invalid or missing route response";
            warnings.push(`Canonical route "/" resolves to ${routeDescription}, not the unique Home page "${homePage.title}" (ID "${homePage.id}").`);
          }
        } catch (error) {
          rootRouteMatchesHome = false;
          warnings.push(`Could not resolve canonical root route "/" to Home page "${homePage.title}" (ID "${homePage.id}"): ${errorMessage(error)}`);
        }
      } else if (!homePage || !rootRouteExists) {
        rootRouteMatchesHome = false;
      }

      if (unsupportedBlockTypes.length > 0) {
        warnings.push(`Pages use block types without a local Starter manifest/renderer: ${unsupportedBlockTypes.join(", ")}. Add support before building.`);
      }
    } catch (error) {
      homepageExists = null;
      rootRouteExists = null;
      rootRouteMatchesHome = null;
      warnings.push(`Could not verify Headless pages and routes: ${errorMessage(error)}. Confirm Headless rendering and the public routes in Backstage's canonical site graph.`);
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
    rootRouteMatchesHome,
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

  if (setup.homepageExists === false) {
    const selectionError = setup.warnings.find((warning) => warning.includes("Expected exactly one Backstage homepage"));
    blockers.push(selectionError
      ? `Backstage Home selection is invalid: ${selectionError}`
      : "Create or designate a Home page in Backstage before building.");
  }
  if (setup.rootRouteExists === false) blockers.push("The Backstage route graph has no root route; fix the Home page or route configuration before building.");
  if (setup.rootRouteMatchesHome === false) {
    const routeError = setup.warnings.find((warning) =>
      warning.includes('Canonical route "/" resolves')
      || warning.includes('Could not resolve canonical root route')
      || warning.includes('uses pathname "/"'),
    );
    blockers.push(routeError
      ? `Backstage Home route is invalid: ${routeError}`
      : 'The canonical root route "/" does not resolve to the unique Home page; ensure its route owner is that Home page at pathname "/".');
  }
  if (setup.rootRouteMatchesHome === null && setup.websiteCount === 1) blockers.push("Could not verify that the canonical root route resolves to the unique Home page; check route resolver access and rerun readiness.");
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
    case "empty":
      blockers.push("The selected Header Navigation has no usable links; add at least one link with a label and supported URL in Backstage.");
      break;
    case "unreadable":
      blockers.push(
        setup.warnings.find((warning) => warning.includes("Could not read or normalize selected header navigation"))
          ?? "The selected Header Navigation could not be read or normalized; verify its saved items and API access, then rerun readiness.",
      );
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
    "Expected exactly one Backstage homepage",
    "unique Home page",
    "route graph has no root route",
    'Canonical route "/" resolves',
    "Could not resolve canonical root route",
    "Selected header navigation",
    "Could not read or normalize selected header navigation",
    "block types without a local Starter manifest/renderer",
    "No saved navigation is configured",
    "multiple navigations but none is selected",
    "selected header navigation was not found",
    "Enable the CMS Custom Blocks module",
    "Could not verify Headless pages and routes",
  ];
  warnings.push(...setup.warnings.filter((warning) => !handledSetupWarnings.some((fragment) => warning.includes(fragment))));

  let readinessContent: Awaited<ReturnType<typeof loadSiteContentForReadiness>> | null = null;
  if (setup.navigationStatus === "configured" || setup.navigationStatus === "single") {
    try {
      const content = await loadSiteContentForReadiness(client, options.navigationId);
      readinessContent = content;
      const usableBeforeFiltering = usableNavigationItems(content.navigation);
      if (usableBeforeFiltering.length > 0) {
        const builtSite = await buildSiteFromContent(content, (path) => client.routes.resolve(path));
        const usableAfterFiltering = usableNavigationItems(builtSite.routePlan.navigation);

        if (usableAfterFiltering.length === 0) {
          blockers.push("Every usable Header Navigation link is removed by the rendered route graph. Add or publish the linked CMS/module routes in Backstage, or update the navigation.");
        }
      }
    } catch (error) {
      blockers.push(`Could not verify Header Navigation against the rendered route graph: ${errorMessage(error)}`);
    }
  }

  let pages: HeadlessPage[] | null = readinessContent?.pages ?? null;
  if (!pages && setup.websiteCount === 1) {
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

      try {
        await attachBackstageForms(pages, client);
      } catch (error) {
        blockers.push(`Contact Form blocks are not renderable: ${errorMessage(error)}`);
      }
    }
  }

  return { websiteName, blockers, warnings, manualGates };
}
