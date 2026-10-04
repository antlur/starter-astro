import assert from "node:assert/strict";
import test from "node:test";
import type { BlockManifest } from "../src/lib/backstage/sync-blocks";
import type { StarterSetupClient } from "../src/lib/backstage/setup";
import { inspectStarterSetup } from "../src/lib/backstage/setup";

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
      pages: { async getHeadlessPages() { return options.pages ?? [{ id: "home", title: "Home", slug: "/", pathname: "/", is_home: true }]; } },
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
  const report = await inspectStarterSetup(fake.client as unknown as StarterSetupClient, [manifest]);

  assert.equal(report.websiteCount, 1);
  assert.equal(report.homepageExists, true);
  assert.equal(report.rootRouteExists, true);
  assert.equal(report.navigationStatus, "page-derived");
  assert.equal(report.navigationCount, 0);
  assert.deepEqual(report.blockChanges, { created: 1, updated: 0 });
  assert.deepEqual(fake.writes, []);
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
