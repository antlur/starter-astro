import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BackstageClient } from "@antlur/backstage";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import { inspectStarterSetup, inspectStarterSiteSetup } from "../src/lib/backstage/setup";
import { applyStarterSitePages } from "../src/lib/backstage/site-initializer";
import { syncBlockManifests } from "../src/lib/backstage/sync-blocks";

for (const envFile of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function main() {
  const args = process.argv.slice(2);
  let contactFormId: string | undefined;
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--apply", "--site", "--confirm-contact-form-recipient"].includes(argument)) {
      flags.add(argument);
      continue;
    }
    if (argument === "--contact-form-id") {
      contactFormId = args[index + 1]?.trim();
      if (!contactFormId || contactFormId.startsWith("--")) throw new Error("Provide a form ID after --contact-form-id.");
      index += 1;
      continue;
    }
    if (argument.startsWith("--contact-form-id=")) {
      contactFormId = argument.slice("--contact-form-id=".length).trim();
      if (!contactFormId) throw new Error("Provide a non-empty --contact-form-id.");
      continue;
    }
    throw new Error(`Unknown setup argument: ${argument}. Use --site to plan starter pages and --apply to write.`);
  }
  if (flags.has("--confirm-contact-form-recipient") && !contactFormId) {
    throw new Error("--confirm-contact-form-recipient requires --contact-form-id.");
  }
  if ((contactFormId || flags.has("--confirm-contact-form-recipient")) && !flags.has("--site")) {
    throw new Error("Contact form options require --site.");
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Setup refuses disabled TLS verification. Use NODE_OPTIONS=--use-system-ca for local certificates.");
  }
  if (!process.env.BACKSTAGE_API_KEY || !process.env.BACKSTAGE_ACCOUNT_ID) {
    throw new Error("Set BACKSTAGE_API_KEY and BACKSTAGE_ACCOUNT_ID in your local environment before setup.");
  }

  const apply = flags.has("--apply");
  const initializeSite = flags.has("--site");
  const confirmContactFormRecipient = flags.has("--confirm-contact-form-recipient");
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

  const siteSetup = initializeSite
    ? await inspectStarterSiteSetup(client, manifests, { contactFormId, confirmContactFormRecipient })
    : null;
  if (siteSetup?.plan) {
    console.log("Starter page plan:");
    for (const action of siteSetup.plan.actions) {
      const description = action.status === "create" ? "create" : action.status === "exists" ? "preserve existing" : "route conflict";
      console.log(`- ${description}: ${action.title} (${action.path})${action.reason ? ` - ${action.reason}` : ""}`);
    }
  }
  for (const warning of siteSetup?.warnings ?? []) console.warn(`- ${warning}`);
  for (const blocker of siteSetup?.blockers ?? []) console.error(`! ${blocker}`);

  if (initializeSite && apply) {
    if (siteSetup?.blockers.length) {
      throw new Error("Starter page setup was not applied because preflight blockers remain.");
    }
    if (!report.customBlocksEnabled) {
      throw new Error("Enable CMS Custom Blocks before creating Starter pages.");
    }
    if (report.blockChanges && (report.blockChanges.created > 0 || report.blockChanges.updated > 0)) {
      throw new Error("Starter block definitions need syncing. Run npm run setup -- --apply first; page initialization does not sync blocks.");
    }
    if (!siteSetup?.plan) throw new Error("Starter page setup has no valid plan.");

    const pages = await applyStarterSitePages(client, siteSetup.plan);
    console.log(`Starter pages created: ${pages.created.length ? pages.created.join(", ") : "none"}.`);
    console.log(`Existing pages preserved: ${pages.preserved.length ? pages.preserved.join(", ") : "none"}.`);
    return;
  }

  if (!apply) {
    console.log(initializeSite
      ? "Check only; Backstage was not changed. Sync definitions with npm run setup -- --apply, then run npm run setup -- --site --apply to create missing starter pages."
      : "Check only; Backstage was not changed. Run npm run setup -- --apply to sync block definitions.");
    return;
  }

  if (!report.customBlocksEnabled) {
    throw new Error("No definitions were changed. Enable CMS Custom Blocks and rerun setup.");
  }

  const result = await syncBlockManifests(client, manifests);
  console.log(`Block sync complete: ${result.created} created, ${result.updated} updated.`);
  console.log("Pages, navigation, menus, forms, and business content are not changed by block sync.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Starter setup failed.");
  process.exitCode = 1;
});
