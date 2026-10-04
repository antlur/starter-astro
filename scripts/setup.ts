import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BackstageClient } from "@antlur/backstage";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import { inspectStarterSetup } from "../src/lib/backstage/setup";
import { syncBlockManifests } from "../src/lib/backstage/sync-blocks";

for (const envFile of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => argument !== "--apply");
  if (unknown.length > 0) throw new Error(`Unknown setup argument: ${unknown[0]}. Use --apply to sync block definitions.`);
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Setup refuses disabled TLS verification. Use NODE_OPTIONS=--use-system-ca for local certificates.");
  }
  if (!process.env.BACKSTAGE_API_KEY || !process.env.BACKSTAGE_ACCOUNT_ID) {
    throw new Error("Set BACKSTAGE_API_KEY and BACKSTAGE_ACCOUNT_ID in your local environment before setup.");
  }

  const apply = args.includes("--apply");
  const manifests = loadBlockManifests(fileURLToPath(new URL("../blocks/", import.meta.url)));
  const client = new BackstageClient();
  const report = await inspectStarterSetup(client, manifests, {
    navigationId: process.env.BACKSTAGE_NAVIGATION_ID,
  });

  console.log("Backstage Astro Starter setup");
  console.log(`Websites: ${report.websiteCount}${report.websiteName ? ` (${report.websiteName})` : ""}`);
  console.log(`CMS Custom Blocks: ${report.customBlocksEnabled ? "enabled" : "disabled"}`);
  const navigationSummary = {
    configured: "selected",
    single: "one saved navigation will be used",
    missing: "not configured; the site will show no page links",
    "selection-required": "multiple saved navigations need a selection",
    invalid: "selected navigation was not found",
    unknown: "not verified",
  }[report.navigationStatus];
  console.log(`Navigation: ${navigationSummary}${report.navigationCount === null ? "" : ` (${report.navigationCount} saved)`}`);
  console.log(`Home page: ${report.homepageExists === null ? "not verified" : report.homepageExists ? "present" : "missing"}`);
  console.log(`Root route: ${report.rootRouteExists === null ? "not verified" : report.rootRouteExists ? "present" : "missing"}`);
  console.log(`SDK block registry: ${report.sdkRegistry.registered}/${report.sdkRegistry.total} Starter contracts`);
  if (report.socialProfileCount !== null) console.log(`Social profiles: ${report.socialProfileCount} configured`);
  if (report.websiteCtaConfigured !== null) console.log(`Website CTA: ${report.websiteCtaConfigured ? "configured" : "not configured"}`);

  if (report.blockChanges) {
    console.log(`Block definitions: ${report.blockChanges.created} to create, ${report.blockChanges.updated} to update.`);
  }
  for (const warning of report.warnings) console.warn(`- ${warning}`);

  if (!apply) {
    console.log("Check only; Backstage was not changed. Run npm run setup -- --apply to sync block definitions.");
    return;
  }

  if (!report.customBlocksEnabled) {
    throw new Error("No definitions were changed. Enable CMS Custom Blocks and rerun setup.");
  }

  const result = await syncBlockManifests(client, manifests);
  console.log(`Block sync complete: ${result.created} created, ${result.updated} updated.`);
  console.log("Pages, navigation, menus, forms, and business content are not changed by this command.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Starter setup failed.");
  process.exitCode = 1;
});
