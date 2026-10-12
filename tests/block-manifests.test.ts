import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";

test("discovers nested block manifests", () => {
  const directory = mkdtempSync(join(tmpdir(), "astro-block-manifests-"));
  const nestedBlock = join(directory, "custom", "weekly-specials");
  const earlierBlock = join(directory, "alpha");
  const manifest = {
    manifest_version: 1,
    type: "block",
    registry_identity: "fieldwork:weekly-specials@1",
    name: "Weekly Specials",
    slug: "weekly-specials",
    schema: { fields: [{ name: "Heading", slug: "heading", type: "text" }] },
  };

  try {
    mkdirSync(nestedBlock, { recursive: true });
    mkdirSync(earlierBlock, { recursive: true });
    writeFileSync(join(nestedBlock, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(earlierBlock, "manifest.json"), JSON.stringify({
      ...manifest,
      registry_identity: "fieldwork:featured-menu@1",
      name: "Featured Menu",
      slug: "featured-menu",
    }));

    assert.deepEqual(loadBlockManifests(directory).map(({ slug }) => slug), ["featured-menu", "weekly-specials"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("colocates each built-in manifest with its Astro renderer", () => {
  const directory = fileURLToPath(new URL("../src/blocks/", import.meta.url));

  for (const manifest of loadBlockManifests(directory)) {
    const blockDirectory = join(directory, manifest.slug);
    const renderers = readdirSync(blockDirectory).filter((entry) => entry.endsWith(".astro"));

    assert.ok(existsSync(join(blockDirectory, "manifest.json")), `${manifest.slug} should have a colocated manifest`);
    assert.equal(renderers.length, 1, `${manifest.slug} should have exactly one colocated Astro renderer`);
  }
});

test("reports the path of an unreadable block manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "astro-block-manifests-"));
  const manifestPath = join(directory, "manifest.json");

  try {
    writeFileSync(manifestPath, "{");
    assert.throws(() => loadBlockManifests(directory), (error: unknown) =>
      error instanceof Error && error.message.includes(manifestPath),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
