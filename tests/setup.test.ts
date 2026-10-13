import assert from "node:assert/strict";
import { listRegistryBlocks } from "@antlur/backstage";
import test from "node:test";
import type { BlockManifest } from "../src/lib/backstage/sync-blocks";
import type { StarterSetupClient } from "../src/lib/backstage/setup";
import {
  assertStarterBlockRegistryComplete,
  formatStarterReadinessReport,
  inspectStarterReadiness,
  inspectStarterSetup,
  inspectStarterSiteSetup,
  starterReadinessExitCode,
} from "../src/lib/backstage/setup";

const manifest: BlockManifest = {
  manifest_version: 1,
  type: "block",
  registry_identity: "fieldwork:hero-copy@1",
  derived_from: "starter-astro:hero@1",
  name: "Hero",
  slug: "hero",
  schema: { fields: [{ name: "Title", slug: "title", type: "text" }] },
};

const bundledHeroManifest = listRegistryBlocks().find(
  ({ registry_identity }) => registry_identity === "starter-astro:hero@1",
) as unknown as BlockManifest;

function client(options: {
  customBlocks?: boolean;
  websites?: unknown[];
  pages?: unknown[];
  routes?: string[];
  navigations?: Array<{ id: string }>;
  headerNavigationId?: string | null;
  socialLinks?: Array<{ name: string; url: string }>;
  homeCtaText?: string;
  homeCtaUrl?: string;
  customLayouts?: boolean;
  formFields?: Array<{ id: string; label: string; type: string }>;
  formIdToReturn?: string;
  existingBlocks?: Array<{
    id: string;
    name?: string;
    slug: string;
    registry_identity?: string | null;
    derived_from?: string | null;
    schema?: BlockManifest["schema"];
  }>;
} = {}) {
  const writes: string[] = [];
  return {
    writes,
    client: {
      modules: {
        async isEnabled(module: string) {
          if (module === "cms.custom_blocks") return options.customBlocks ?? true;
          if (module === "cms.custom_layouts") return options.customLayouts ?? true;
          return true;
        },
      },
      website: {
        async getWebsites() {
          return options.websites ?? [{
            id: "site-1",
            app_name: "Demo",
            header_navigation_id: options.headerNavigationId ?? null,
            social_links: options.socialLinks ?? [],
            home_cta_text: options.homeCtaText,
            home_cta_url: options.homeCtaUrl,
          }];
        },
        async getWebsiteRoutes() { return options.routes ?? ["/"]; },
      },
      navigation: { async list() { return options.navigations ?? []; } },
      pages: { async getHeadlessPages() { return options.pages ?? [{ id: "home", title: "Home", slug: "/", pathname: "/", is_home: true, blocks: [] }]; } },
      forms: { async getFormDefinition(id: string) { return { id: options.formIdToReturn ?? id, title: "Contact", type: "email", action: null, redirect_url: null, recaptcha_site_key: null, fields: options.formFields ?? [] }; } },
      blocks: {
        async list() { return options.existingBlocks ?? []; },
        async create() { writes.push("create"); },
        async update() { writes.push("update"); },
      },
    },
  };
}

test("setup check is read-only and reports a valid home and block plan", async () => {
  const fake = client();
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [manifest] });

  assert.equal(report.websiteCount, 1);
  assert.equal(report.homepageExists, true);
  assert.equal(report.rootRouteExists, true);
  assert.deepEqual(report.sdkRegistry, { registered: 0, total: 0, missingSlugs: [] });
  assert.equal(report.socialProfileCount, 0);
  assert.equal(report.websiteCtaConfigured, false);
  assert.equal(report.navigationStatus, "missing");
  assert.equal(report.navigationCount, 0);
  assert.ok(report.warnings.some((warning) => warning.includes("site will show no page links")));
  assert.deepEqual(report.blockChanges, { created: 1, updated: 0 });
  assert.deepEqual(fake.writes, []);
});

test("setup check reports outdated SDK block contracts and missing optional site links", async () => {
  const fake = client();
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [bundledHeroManifest], { sdkRegistry: [] });

  assert.deepEqual(report.sdkRegistry, { registered: 0, total: 1, missingSlugs: ["hero"] });
  assert.ok(report.warnings.some((warning) => warning.includes("SDK registry is missing Starter block contracts")));
  assert.ok(report.warnings.some((warning) => warning.includes("social icons")));
  assert.ok(report.warnings.some((warning) => warning.includes("website-level CTA")));
});

test("setup check reports account prerequisites without writing", async () => {
  const fake = client({ customBlocks: false, websites: [] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.equal(report.websiteCount, 0);
  assert.equal(report.customBlocksEnabled, false);
  assert.equal(report.homepageExists, null);
  assert.equal(report.navigationStatus, "unknown");
  assert.equal(report.navigationCount, null);
  assert.equal(report.blockChanges, null);
  assert.ok(report.warnings.some((warning) => warning.includes("exactly one")));
  assert.ok(report.warnings.some((warning) => warning.includes("Enable the CMS Custom Blocks")));
  assert.deepEqual(fake.writes, []);
});

test("setup check directs Headless sites to the canonical route graph without requiring legacy routing mode", async () => {
  const fake = client();
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);
  const renderingGuidance = report.warnings.find((warning) => warning.includes("Confirm Headless rendering"));

  assert.ok(renderingGuidance?.includes("canonical route graph"));
  assert.ok(renderingGuidance?.includes("does not require the legacy Application owned routing mode"));
});

test("setup check explains when saved navigations need an explicit selection", async () => {
  const fake = client({ navigations: [{ id: "nav-1" }, { id: "nav-2" }] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.equal(report.navigationStatus, "selection-required");
  assert.ok(report.warnings.some((warning) => warning.includes("multiple navigations")));
});

test("setup check validates configured navigation without writing", async () => {
  const fake = client({ navigations: [{ id: "nav-1" }], headerNavigationId: "nav-1" });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.equal(report.navigationStatus, "configured");
  assert.deepEqual(fake.writes, []);
});

test("setup check accepts an environment-selected navigation", async () => {
  const fake = client({ navigations: [{ id: "nav-1" }, { id: "nav-2" }] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest], { navigationId: "nav-2" });

  assert.equal(report.navigationStatus, "configured");
  assert.deepEqual(fake.writes, []);
});

test("setup check reports a stale navigation selection", async () => {
  const fake = client({ navigations: [{ id: "nav-1" }] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest], { navigationId: "missing" });

  assert.equal(report.navigationStatus, "invalid");
  assert.ok(report.warnings.some((warning) => warning.includes("not found")));
});

test("setup accepts valid site-owned manifests that are not in the SDK registry", async () => {
  const fake = client();
  const clientApi = fake.client as unknown as StarterSetupClient;
  const report = await inspectStarterSetup(clientApi, [manifest], { sdkRegistry: [] });
  const siteReport = await inspectStarterSiteSetup(clientApi, [manifest], { sdkRegistry: [] });

  assert.deepEqual(report.sdkRegistry, { registered: 0, total: 0, missingSlugs: [] });
  assert.deepEqual(report.blockChanges, { created: 1, updated: 0 });
  assert.equal(siteReport.blockers.length, 0);
  assert.doesNotThrow(() => assertStarterBlockRegistryComplete([manifest], []));
  assert.deepEqual(fake.writes, []);
});

test("setup rejects malformed site-owned manifests and modified bundled contracts", () => {
  assert.throws(
    () => assertStarterBlockRegistryComplete([{ ...manifest, registry_identity: "fieldwork:bad-identity" }]),
    /Invalid block identity/,
  );
  assert.throws(
    () => assertStarterBlockRegistryComplete([
      { ...manifest, schema: { fields: [{ name: "Title", slug: "title", type: "unknown" }] } } as unknown as BlockManifest,
    ]),
    /not a supported Backstage field type/,
  );
  assert.throws(
    () => assertStarterBlockRegistryComplete([{ ...bundledHeroManifest, schema: { fields: [] } }]),
    /differs from the registry contract/,
  );
  assert.throws(
    () => assertStarterBlockRegistryComplete([{ ...bundledHeroManifest, registry_identity: "starter-astro:hero@2" }]),
    /Unsupported registry identity/,
  );
});

test("setup preflight preserves stale identity, slug ownership, and explicit adoption safeguards", async () => {
  const cases = [
    {
      blocks: [{ id: "old-id", slug: "old-hero", registry_identity: manifest.registry_identity }],
      message: /Cannot rename "fieldwork:hero-copy@1"/,
    },
    {
      blocks: [{ id: "other-id", slug: "hero", registry_identity: "another-site:hero@1" }],
      message: /Slug "hero" is already owned by another-site:hero@1/,
    },
    {
      blocks: [{ id: "unregistered-id", slug: "hero", registry_identity: null }],
      message: /Slug "hero" is already owned by unregistered block unregistered-id/,
    },
  ];

  for (const { blocks, message } of cases) {
    const fake = client({ existingBlocks: blocks });
    await assert.rejects(
      () => inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]),
      message,
    );
    assert.deepEqual(fake.writes, []);
  }
});

test("setup check reports missing homepage and root route", async () => {
  const fake = client({ pages: [], routes: ["/about/"] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.equal(report.homepageExists, false);
  assert.equal(report.rootRouteExists, false);
  assert.ok(report.warnings.some((warning) => warning.includes("No Home page")));
  assert.ok(report.warnings.some((warning) => warning.includes("no root route")));
});

test("setup check warns when a page uses a block without a local renderer", async () => {
  const fake = client({ pages: [{ blocks: [{ type: "video-hero" }] }] });
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.ok(report.warnings.some((warning) => warning.includes("video-hero") && warning.includes("local Starter manifest/renderer")));
});

test("starter site preflight is read-only and refuses an incomplete SDK registry", async () => {
  const fake = client({ routes: ["/"] });
  const report = await inspectStarterSiteSetup(fake.client as unknown as StarterSetupClient, [bundledHeroManifest], { sdkRegistry: [] });

  assert.equal(report.plan?.actions[0].status, "exists");
  assert.equal(report.plan?.actions[1].status, "create");
  assert.ok(report.blockers.some((blocker) => blocker.includes("missing Starter contracts: hero")));
  assert.deepEqual(fake.writes, []);
});

test("block writes require bundled Starter contracts but allow site-owned contracts", () => {
  assert.throws(() => assertStarterBlockRegistryComplete([bundledHeroManifest], []), /missing Starter block contracts: hero/);
  assert.doesNotThrow(() => assertStarterBlockRegistryComplete([bundledHeroManifest]));
  assert.doesNotThrow(() => assertStarterBlockRegistryComplete([manifest], []));
});

test("starter site preflight includes a form page only after explicit recipient confirmation", async () => {
  const fake = client({ formFields: [{ id: "name", label: "Name", type: "text" }] });
  const clientApi = fake.client as unknown as StarterSetupClient;
  const unconfirmed = await inspectStarterSiteSetup(clientApi, [manifest], {
    contactFormId: "form-1",
    sdkRegistry: [manifest],
  });

  assert.equal(unconfirmed.plan?.actions.some(({ path }) => path === "/contact"), false);
  assert.ok(unconfirmed.warnings.some((warning) => warning.includes("Verify the selected form")));

  const confirmed = await inspectStarterSiteSetup(clientApi, [manifest], {
    contactFormId: "form-1",
    confirmContactFormRecipient: true,
    sdkRegistry: [manifest],
  });

  assert.equal(confirmed.blockers.length, 0);
  assert.equal(confirmed.plan?.actions.find(({ path }) => path === "/contact")?.status, "create");
  assert.ok(confirmed.warnings.some((warning) => warning.includes("cannot be verified")));
  assert.deepEqual(fake.writes, []);
});

test("starter site preflight refuses a Contact Form response for a different ID", async () => {
  const fake = client({ formFields: [{ id: "name", label: "Name", type: "text" }], formIdToReturn: "another-form" });
  const clientApi = fake.client as unknown as StarterSetupClient;

  const report = await inspectStarterSiteSetup(clientApi, [manifest], {
    contactFormId: "form-1",
    confirmContactFormRecipient: true,
    sdkRegistry: [manifest],
  });

  assert.ok(report.blockers.some((blocker) => blocker.includes("did not match the requested form ID")));
  assert.equal(report.plan?.actions.some(({ path }) => path === "/contact"), false);
  assert.deepEqual(fake.writes, []);
});

test("explicit readiness reports a complete account as ready without optional warnings", async () => {
  const fake = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    socialLinks: [{ name: "Instagram", url: "https://example.com/social" }],
    homeCtaText: "View menu",
    homeCtaUrl: "/menu",
    existingBlocks: [{
      id: "block-hero",
      name: manifest.name,
      slug: manifest.slug,
      registry_identity: manifest.registry_identity,
      derived_from: manifest.derived_from,
      schema: manifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.equal(report.websiteName, "Demo");
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, []);
  assert.ok(report.manualGates.some((gate) => gate.includes("does not expose the rendering mode")));
  assert.equal(starterReadinessExitCode(report), 0);
  assert.deepEqual(fake.writes, []);
});

test("readiness report formats blockers, warnings, and manual gates in order", () => {
  const output = formatStarterReadinessReport({
    websiteName: "Demo",
    blockers: ["Create a Home page in Backstage."],
    warnings: ["The selected form's recipient cannot be verified."],
    manualGates: ["Confirm the deployed domain and canonical URLs."],
  });

  assert.equal(output, [
    "Automated readiness: BLOCKED (Demo)",
    "Blockers:",
    "- Create a Home page in Backstage.",
    "Warnings:",
    "- The selected form's recipient cannot be verified.",
    "Manual launch gates (not verified by this command):",
    "- Confirm the deployed domain and canonical URLs.",
    "A READY result covers only the automated account checks above; it is not production launch approval.",
  ].join("\n"));
});

test("explicit readiness blocks missing required account setup and sync drift", async () => {
  const fake = client({ customBlocks: false, websites: [] });
  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(report.blockers.some((blocker) => blocker.includes("exactly one Backstage website")));
  assert.ok(report.blockers.some((blocker) => blocker.includes("Enable the CMS Custom Blocks")));
  assert.equal(starterReadinessExitCode(report), 1);

  const drift = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
  });
  const driftReport = await inspectStarterReadiness(drift.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(driftReport.blockers.some((blocker) => blocker.includes("out of sync")));
  assert.deepEqual(drift.writes, []);

  const unsupported = client({
    customBlocks: false,
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    pages: [{
      id: "home",
      title: "Home",
      slug: "/",
      pathname: "/",
      is_home: true,
      blocks: [{ id: "unknown", type: "unknown-block", fields: {} }],
    }],
    existingBlocks: [],
  });
  const unsupportedReport = await inspectStarterReadiness(unsupported.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(unsupportedReport.blockers.some((blocker) => blocker.includes("Enable the CMS Custom Blocks")));
  assert.ok(unsupportedReport.blockers.some((blocker) => blocker.includes("unknown-block")));
  assert.deepEqual(unsupported.writes, []);
});

test("explicit readiness blocks missing Home/root routes and ambiguous navigation", async () => {
  const fake = client({
    pages: [],
    routes: ["/about/"],
    navigations: [{ id: "nav-1" }, { id: "nav-2" }],
    existingBlocks: [{
      id: "block-hero",
      name: manifest.name,
      slug: manifest.slug,
      registry_identity: manifest.registry_identity,
      derived_from: manifest.derived_from,
      schema: manifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(report.blockers.some((blocker) => blocker.includes("Create or designate a Home page")));
  assert.ok(report.blockers.some((blocker) => blocker.includes("no root route")));
  assert.ok(report.blockers.some((blocker) => blocker.includes("Select a Header Navigation")));
  assert.equal(starterReadinessExitCode(report), 1);
});

test("explicit readiness treats optional site configuration as warnings, not blockers", async () => {
  const fake = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    existingBlocks: [{
      id: "block-hero",
      name: manifest.name,
      slug: manifest.slug,
      registry_identity: manifest.registry_identity,
      derived_from: manifest.derived_from,
      schema: manifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.deepEqual(report.blockers, []);
  assert.ok(report.warnings.some((warning) => warning.includes("social profile")));
  assert.ok(report.warnings.some((warning) => warning.includes("website-level CTA")));
  assert.equal(starterReadinessExitCode(report), 0);
  assert.deepEqual(fake.writes, []);
});

test("explicit readiness reports invalid page responses as blockers", async () => {
  const fake = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    pages: [{ id: "invalid-page" }],
    existingBlocks: [{
      id: "block-hero",
      name: manifest.name,
      slug: manifest.slug,
      registry_identity: manifest.registry_identity,
      derived_from: manifest.derived_from,
      schema: manifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(report.blockers.some((blocker) => blocker.includes("invalid page at index 0")));
  assert.equal(starterReadinessExitCode(report), 1);
  assert.deepEqual(fake.writes, []);
});

test("explicit readiness reuses build validation for used blocks and assigned layouts", async () => {
  const fake = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    pages: [{
      id: "home",
      title: "Home",
      slug: "/",
      pathname: "/",
      is_home: true,
      blocks: [{ id: "block-1", type: "missing-renderer", fields: {} }],
      layout: { id: "layout-1", name: "Unknown", slug: "not-in-starter", schema: { fields: [] }, data: {} },
    }],
    existingBlocks: [{
      id: "block-hero",
      name: manifest.name,
      slug: manifest.slug,
      registry_identity: manifest.registry_identity,
      derived_from: manifest.derived_from,
      schema: manifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.ok(report.blockers.some((blocker) => blocker.includes("no synced Custom Block definition for: missing-renderer")));
  assert.ok(report.blockers.some((blocker) => blocker.includes("no matching definition and Astro renderer")));
  assert.equal(starterReadinessExitCode(report), 1);
  assert.deepEqual(fake.writes, []);
});

test("explicit readiness blocks when the SDK registry lacks a bundled Starter contract", async () => {
  const fake = client({
    headerNavigationId: "nav-1",
    navigations: [{ id: "nav-1" }],
    existingBlocks: [{
      id: "block-hero",
      name: bundledHeroManifest.name,
      slug: bundledHeroManifest.slug,
      registry_identity: bundledHeroManifest.registry_identity,
      derived_from: bundledHeroManifest.derived_from,
      schema: bundledHeroManifest.schema,
    }],
  });

  const report = await inspectStarterReadiness(fake.client as unknown as StarterSetupClient, [bundledHeroManifest], { sdkRegistry: [] });

  assert.ok(report.blockers.some((blocker) => blocker.includes("installed SDK is missing Starter block contracts: hero")));
  assert.equal(starterReadinessExitCode(report), 1);
  assert.deepEqual(fake.writes, []);
});
