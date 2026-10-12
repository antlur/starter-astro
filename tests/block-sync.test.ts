import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadBlockManifests } from "../src/lib/backstage/block-manifests";
import { syncBlockManifests, validateBlockManifests, type BlockManifest, type BlockSyncClient } from "../src/lib/backstage/sync-blocks";

const manifest = JSON.parse(
  readFileSync(new URL("../src/blocks/hero/manifest.json", import.meta.url), "utf8"),
) as BlockManifest;

test("creates the complete starter block set for a new account", async () => {
  const manifests = loadBlockManifests(fileURLToPath(new URL("../src/blocks", import.meta.url)));
  const created: Array<Record<string, unknown>> = [];
  const client = {
    blocks: {
      async list() {
        return [];
      },
      async create(payload: Record<string, unknown>) {
        created.push(payload);
      },
      async update() {
        throw new Error("new account sync should not update existing blocks");
      },
    },
  };

  assert.ok(manifests.some(({ registry_identity }) => registry_identity === "starter-astro:image-link-grid@1"));
  assert.ok(manifests.some(({ registry_identity }) => registry_identity === "starter-astro:video-hero@1"));
  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, manifests), {
    created: manifests.length,
    updated: 0,
  });
  assert.deepEqual(
    created.map(({ registry_identity }) => registry_identity).sort(),
    manifests.map(({ registry_identity }) => registry_identity).sort(),
  );
});

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

test("adopts only an explicitly selected unregistered block", async () => {
  const calls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const client = {
    blocks: {
      async list() {
        return [{ id: "old-hero", slug: "hero", registry_identity: null }];
      },
      async create() {
        throw new Error("create should not run when the slug is already taken");
      },
      async update(id: string, payload: Record<string, unknown>) {
        calls.push({ id, payload });
        return { id, ...payload };
      },
    },
  };

  assert.deepEqual(
    await syncBlockManifests(client as unknown as BlockSyncClient, [manifest], {
      adoptUnregisteredSlugs: ["hero"],
    }),
    { created: 0, updated: 1 },
  );
  assert.equal(calls[0].id, "old-hero");
  assert.equal(calls[0].payload.registry_identity, manifest.registry_identity);
  assert.deepEqual(calls[0].payload.schema, manifest.schema);
});

test("does not adopt a block registered to a different identity", async () => {
  const client = {
    blocks: {
      async list() {
        return [{ id: "owned-hero", slug: "hero", registry_identity: "another-project:hero@1" }];
      },
      async create() {
        throw new Error("create should not run when the slug is already taken");
      },
      async update() {
        throw new Error("a registered block owned by another project must not be updated");
      },
    },
  };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest], {
      adoptUnregisteredSlugs: ["hero"],
    }),
    /already owned by another-project:hero@1/,
  );
});

test("preserves account-only fields when adopting a block after a create conflict", async () => {
  const accountFields = [
    ...structuredClone(manifest.schema.fields),
    { name: "Account Note", slug: "account_note", type: "text" },
  ];
  let listCount = 0;
  let updated = false;
  const client = {
    blocks: {
      async list() {
        listCount += 1;
        return listCount === 1 ? [] : [{
          id: "concurrent-hero",
          name: manifest.name,
          slug: manifest.slug,
          registry_identity: null,
          schema: { fields: accountFields },
        }];
      },
      async create() {
        const error = new Error("slug conflict") as Error & { response?: { status: number } };
        error.response = { status: 409 };
        throw error;
      },
      async update() { updated = true; },
    },
  };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest], {
      adoptUnregisteredSlugs: [manifest.slug],
    }),
    /account_note/,
  );
  assert.equal(updated, false);
  assert.equal(listCount, 2);
});

test("rejects adoption slugs without a local manifest", async () => {
  const client = { blocks: { async list() { return []; } } };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest], {
      adoptUnregisteredSlugs: ["not-in-starter"],
    }),
    /no local block manifest uses that slug/,
  );
});

test("rejects malformed and duplicate semantic field definitions", () => {
  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [{ name: "Heading", type: "text" }] } }]),
    /schema\.fields\.0\.slug must be a non-empty string/,
  );

  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [
      { name: "Heading", slug: "heading", type: "text" },
      { name: "Second heading", slug: "heading", type: "text" },
    ] } }]),
    /schema\.fields\.1\.slug duplicates "heading"/,
  );

  assert.throws(
    () => validateBlockManifests([manifest, { ...manifest, slug: "hero-copy" }]),
    /Multiple local manifests use identity/,
  );

  assert.throws(
    () => validateBlockManifests([manifest, { ...manifest, registry_identity: "fieldwork:hero-copy@1" }]),
    /Multiple local manifests use slug/,
  );

  assert.throws(() => validateBlockManifests([null]), /Block manifest must be a JSON object/);
});

test("rejects field types that are not supported by the SDK", () => {
  const field = manifest.schema.fields[0];

  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [{ ...field, type: "phoen" }] } }]),
    /schema\.fields\.0\.type is not a supported Backstage field type/,
  );
});

test("rejects malformed field metadata in block manifests", () => {
  const baseField = manifest.schema.fields[0];
  const malformedFields = [
    { ...baseField, required: "yes" },
    { ...baseField, is_multiple: 1 },
    { ...baseField, allowed_references: "hero" },
    { ...baseField, options: [{ label: "Missing value" }] },
  ];
  const expectedErrors = [
    /schema\.fields\.0\.required must be a boolean/,
    /invalid multiple-value setting for "variant"/,
    /invalid reference targets for "variant"/,
    /invalid options for "variant"/,
  ];

  for (const [index, field] of malformedFields.entries()) {
    assert.throws(
      () => validateBlockManifests([{
        ...manifest,
        registry_identity: "starter-astro:test-hero@1",
        derived_from: manifest.registry_identity,
        schema: { fields: [field] },
      }]),
      expectedErrors[index],
    );
  }
});
