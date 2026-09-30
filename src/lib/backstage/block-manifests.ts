import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BlockManifest } from "./sync-blocks";

function findManifestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findManifestFiles(path);
      return entry.isFile() && entry.name === "manifest.json" ? [path] : [];
    });
}

export function loadBlockManifests(directory = resolve(process.cwd(), "blocks")): BlockManifest[] {
  if (!existsSync(directory)) {
    throw new Error(`No block manifests were found in "${directory}".`);
  }

  const paths = findManifestFiles(directory);
  if (paths.length === 0) {
    throw new Error(`No block manifests were found in "${directory}".`);
  }

  return paths.map((path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as BlockManifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read block manifest at "${path}": ${message}`);
    }
  });
}
