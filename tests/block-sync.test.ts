import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { syncBlockManifests, validateBlockManifests, type BlockManifest, type BlockSyncClient } from "../src/lib/backstage/sync-blocks";

const manifest = JSON.parse(
  readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"),
) as BlockManifest;

test("creates an account block once and skips it on a matching sync", async () => {
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
          name: String(payload.name),
          slug: String(payload.slug),
          description: payload.description as string | null | undefined,
          registry_identity: String(payload.registry_identity),
          derived_from: payload.derived_from as string | null | undefined,
          schema: payload.schema,
        };
        blocks.push(block as typeof blocks[number]);
        return block;
      },
      async update(id: string, payload: Record<string, unknown>) {
        calls.push({ method: "update", payload });
        const block = blocks.find((candidate) => candidate.id === id);
        if (block) Object.assign(block, payload);
        return { id, ...payload };
      },
    },
  };

  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, [manifest]), { created: 1, updated: 0 });
  assert.deepEqual(await syncBlockManifests(client as unknown as BlockSyncClient, [manifest]), { created: 0, updated: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload?.registry_identity, "starter-astro:hero@1");
  assert.equal(calls[0].payload?.derived_from, "backstage:hero@1");
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
          description: null,
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

test("rejects adoption slugs without a local manifest", async () => {
  const client = { blocks: { async list() { return []; } } };

  await assert.rejects(
    () => syncBlockManifests(client as unknown as BlockSyncClient, [manifest], {
      adoptUnregisteredSlugs: ["not-in-starter"],
    }),
    /no matching block manifest/,
  );
});

test("rejects malformed and duplicate semantic field definitions", () => {
  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [{ name: "Heading", type: "text" }] } }]),
    /invalid schema.fields\[0\].*name, slug, and type/,
  );

  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [
      { name: "Heading", slug: "heading", type: "text" },
      { name: "Second heading", slug: "heading", type: "text" },
    ] } }]),
    /duplicate field slug "heading"/,
  );

  assert.throws(
    () => validateBlockManifests([manifest, { ...manifest, slug: "hero-copy" }]),
    /unique identities and slugs/,
  );

  assert.throws(
    () => validateBlockManifests([manifest, { ...manifest, registry_identity: "fieldwork:hero-copy@1" }]),
    /unique identities and slugs/,
  );

  assert.throws(() => validateBlockManifests([null]), /missing valid identity, name, slug, or schema/);
});

test("rejects field types that are not supported by the SDK", () => {
  const field = manifest.schema.fields[0];

  assert.throws(
    () => validateBlockManifests([{ ...manifest, schema: { fields: [{ ...field, type: "phoen" }] } }]),
    /unsupported field type "phoen" for "variant" in schema.fields/,
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
    /invalid required setting for "variant"/,
    /invalid multiple-value setting for "variant"/,
    /invalid reference targets for "variant"/,
    /invalid options for "variant"/,
  ];

  for (const [index, field] of malformedFields.entries()) {
    assert.throws(
      () => validateBlockManifests([{ ...manifest, schema: { fields: [field] } }]),
      expectedErrors[index],
    );
  }
});
