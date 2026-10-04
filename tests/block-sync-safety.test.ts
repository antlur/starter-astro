import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { syncBlockManifests, type BlockManifest, type BlockSyncClient } from "../src/lib/backstage/sync-blocks";

const manifest = JSON.parse(
  readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"),
) as BlockManifest;

test("skips a matching account block definition", async () => {
  const calls: string[] = [];
  const client = {
    blocks: {
      async list() {
        return [{
          id: "hero-id",
          name: manifest.name,
          slug: manifest.slug,
          description: manifest.description,
          registry_identity: manifest.registry_identity,
          derived_from: manifest.derived_from,
          schema: manifest.schema,
        }];
      },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  };

  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, [manifest]), { created: 0, updated: 0 });
  assert.deepEqual(calls, []);
});

test("updates a registered block only when the local definition changed", async () => {
  const calls: string[] = [];
  const changedManifest = { ...manifest, description: "Updated description" };
  const client = {
    blocks: {
      async list() {
        return [{
          id: "hero-id",
          name: manifest.name,
          slug: manifest.slug,
          description: manifest.description,
          registry_identity: manifest.registry_identity,
          derived_from: manifest.derived_from,
          schema: manifest.schema,
        }];
      },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  };

  assert.deepEqual(
    await syncBlockManifests(client as unknown as BlockSyncClient, [changedManifest], { dryRun: true }),
    { created: 0, updated: 1 },
  );
  assert.deepEqual(calls, []);
});

test("refuses to remove account fields missing from the local manifest", async () => {
  const calls: string[] = [];
  const client = {
    blocks: {
      async list() {
        return [{
          id: "hero-id",
          name: manifest.name,
          slug: manifest.slug,
          registry_identity: manifest.registry_identity,
          schema: { fields: [...manifest.schema.fields, { name: "Remote field", slug: "remote_field", type: "text" }] },
        }];
      },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest]),
    /fields not present in this local manifest: remote_field.*may be older/,
  );
  assert.deepEqual(calls, []);
});

test("dry run reports planned changes without writing", async () => {
  const calls: string[] = [];
  const client = {
    blocks: {
      async list() { return []; },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  };

  assert.deepEqual(
    await syncBlockManifests(client as unknown as BlockSyncClient, [manifest], { dryRun: true }),
    { created: 1, updated: 0 },
  );
  assert.deepEqual(calls, []);
});

test("preflights every slug before writing any block", async () => {
  const calls: string[] = [];
  const secondManifest = {
    ...manifest,
    name: "Reserved",
    slug: "reserved",
    registry_identity: "starter-astro:reserved@1",
  };
  const client = {
    blocks: {
      async list() {
        return [
          { id: "hero-id", slug: manifest.slug, registry_identity: manifest.registry_identity },
          { id: "reserved-id", slug: "reserved", registry_identity: "another-site:reserved@1" },
        ];
      },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest, secondManifest]),
    /already owned by another-site:reserved@1/,
  );
  assert.deepEqual(calls, []);
});
