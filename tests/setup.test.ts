import assert from "node:assert/strict";
import test from "node:test";
import type { BlockManifest } from "../src/lib/backstage/sync-blocks";
import type { StarterSetupClient } from "../src/lib/backstage/setup";
import { inspectStarterSetup, inspectStarterSiteSetup } from "../src/lib/backstage/setup";

const manifest: BlockManifest = {
  manifest_version: 1,
  type: "block",
  registry_identity: "starter-astro:hero@1",
  derived_from: "backstage:hero@1",
  name: "Hero",
  slug: "hero",
  schema: { fields: [{ name: "Title", slug: "title", type: "text" }] },
};

function client(options: {
  customBlocks?: boolean;
  websites?: unknown[];
  pages?: unknown[];
  routes?: string[];
  navigations?: Array<{ id: string }>;
  headerNavigationId?: string | null;
  formFields?: Array<{ id: string; label: string; type: string }>;
  formIdToReturn?: string;
} = {}) {
  const writes: string[] = [];
  return {
    writes,
    client: {
      modules: { async isEnabled() { return options.customBlocks ?? true; } },
      website: {
        async getWebsites() { return options.websites ?? [{ id: "site-1", app_name: "Demo", header_navigation_id: options.headerNavigationId ?? null }]; },
        async getWebsiteRoutes() { return options.routes ?? ["/"]; },
      },
      navigation: { async list() { return options.navigations ?? []; } },
      pages: { async getHeadlessPages() { return options.pages ?? [{ id: "home", title: "Home", slug: "/", pathname: "/", is_home: true, blocks: [] }]; } },
      forms: { async getFormDefinition(id: string) { return { id: options.formIdToReturn ?? id, title: "Contact", type: "email", action: null, redirect_url: null, recaptcha_site_key: null, fields: options.formFields ?? [] }; } },
      blocks: {
        async list() { return []; },
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
  assert.deepEqual(report.sdkRegistry, { registered: 1, total: 1, missingSlugs: [] });
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
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

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
  const report = await inspectStarterSiteSetup(fake.client as unknown as StarterSetupClient, [manifest], { sdkRegistry: [] });

  assert.equal(report.plan?.actions[0].status, "exists");
  assert.equal(report.plan?.actions[1].status, "create");
  assert.ok(report.blockers.some((blocker) => blocker.includes("missing Starter contracts: hero")));
  assert.deepEqual(fake.writes, []);
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
