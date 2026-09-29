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

const result = await syncBlockManifests(new BackstageClient(), manifests);
console.log(`Block sync complete: ${result.created} created, ${result.updated} updated.`);
