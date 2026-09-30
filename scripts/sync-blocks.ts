import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackstageClient } from "@antlur/backstage";
import { syncBlockManifests, type BlockManifest } from "../src/lib/backstage/sync-blocks";

for (const envFile of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  throw new Error("Block sync refuses disabled TLS verification. Use NODE_OPTIONS=--use-system-ca for local certificates.");
}

const blocksDirectory = fileURLToPath(new URL("../blocks/", import.meta.url));

async function findManifestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await findManifestFiles(path)));
    else if (entry.isFile() && entry.name === "manifest.json") paths.push(path);
  }

  return paths;
}

const manifestPaths = (await findManifestFiles(blocksDirectory)).sort();
const manifests = await Promise.all(
  manifestPaths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as BlockManifest),
);

const client = new BackstageClient();

if (!(await client.modules.isEnabled("cms.custom_blocks"))) {
  throw new Error("Enable the CMS Custom Blocks module for BACKSTAGE_ACCOUNT_ID before syncing block manifests.");
}

const adoptUnregisteredSlugs = process.argv.slice(2).flatMap((argument) => {
  const prefix = "--adopt-unregistered=";

  if (!argument.startsWith(prefix)) {
    throw new Error(`Unknown block sync argument: ${argument}`);
  }

  const slug = argument.slice(prefix.length).trim();

  if (!slug) {
    throw new Error("Provide a block slug with --adopt-unregistered=<slug>.");
  }

  return [slug];
});

const result = await syncBlockManifests(client, manifests, { adoptUnregisteredSlugs });
console.log(`Block sync complete: ${result.created} created, ${result.updated} updated.`);
