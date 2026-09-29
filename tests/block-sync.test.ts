import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { syncBlockManifests, type BlockManifest, type BlockSyncClient } from "../src/lib/backstage/sync-blocks";

const manifest = JSON.parse(
  readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"),
) as BlockManifest;

test("creates and then updates an account block by its registered identity", async () => {
  const blocks: Array<{ id: string; slug: string; registry_identity: string; derived_from?: string | null }> = [];
  const calls: Array<{ method: string; payload?: Record<string, unknown> }> = [];
  const client = {
    blocks: {
      async list() {
        return blocks.map((block) => ({ ...block }));
      },
      async create(payload: Record<string, unknown>) {
        calls.push({ method: "create", payload });
        const block = {
          id: "hero-id",
          slug: String(payload.slug),
          registry_identity: String(payload.registry_identity),
          derived_from: String(payload.derived_from),
        };
        blocks.push(block);
        return block;
      },
      async update(id: string, payload: Record<string, unknown>) {
        calls.push({ method: "update", payload });
        return { id, ...payload };
      },
    },
  };

  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, [manifest]), { created: 1, updated: 0 });
  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, [manifest]), { created: 0, updated: 1 });
  assert.equal(calls[0].payload?.registry_identity, "starter-astro:hero@1");
  assert.equal(calls[0].payload?.derived_from, "backstage:hero@1");
});

test("refuses to overwrite an unregistered block with a matching slug", async () => {
  let updated = false;
  const client = {
    blocks: {
      async list() {
        return [{ id: "old-hero", slug: "hero", registry_identity: null }];
      },
      async create() {
        throw new Error("create should not run when the slug is already taken");
      },
      async update() {
        updated = true;
      },
    },
  };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest]),
    /already owned by unregistered block old-hero/,
  );
  assert.equal(updated, false);
});
