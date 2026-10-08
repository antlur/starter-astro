import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Field } from "@antlur/backstage/studio";
import { syncBlockManifests, validateBlockManifests, type BlockManifest, type BlockSyncClient } from "../src/lib/backstage/sync-blocks";

const manifest = JSON.parse(
  readFileSync(new URL("../blocks/hero/manifest.json", import.meta.url), "utf8"),
) as BlockManifest;

function withFieldMetadata(slug: string, metadata: Record<string, unknown>): BlockManifest {
  const changed = structuredClone(manifest);
  const find = (fields: readonly Field[]): Field | undefined => {
    for (const field of fields) {
      if (field.slug === slug) return field;
      const nested = find(field.fields ?? []);
      if (nested) return nested;
    }
    return undefined;
  };

  const field = find(changed.schema.fields);
  assert.ok(field, `Expected manifest to contain field "${slug}".`);
  Object.assign(field, metadata);
  return changed;
}

function clientFor(block: Record<string, unknown>, calls: string[]) {
  return {
    blocks: {
      async list() { return [block]; },
      async create() { calls.push("create"); },
      async update() { calls.push("update"); },
    },
  } as unknown as BlockSyncClient;
}

test("preserves unspecified block ancestry when the definition already matches", async () => {
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
          derived_from: "backstage:hero@1",
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

test("detects drift in all supported field metadata, including nested fields", async (t) => {
  const cases = [
    { name: "required", slug: "label", metadata: { required: false } },
    { name: "allowed references", slug: "heading", metadata: { allowed_references: ["page"] } },
    { name: "primary field", slug: "heading", metadata: { is_primary: true } },
    { name: "list visibility", slug: "heading", metadata: { show_in_list: true } },
    { name: "default value", slug: "heading", metadata: { value: "Default heading" } },
  ];

  for (const { name, slug, metadata } of cases) {
    await t.test(name, async () => {
      const changedManifest = withFieldMetadata(slug, metadata);
      const calls: string[] = [];
      const client = clientFor({
        id: "hero-id",
        ...manifest,
        schema: manifest.schema,
      }, calls);

      assert.deepEqual(
        await syncBlockManifests(client, [changedManifest]),
        { created: 0, updated: 1 },
      );
      assert.deepEqual(calls, ["update"]);
    });
  }
});

test("compares object-valued field options without depending on key order", async () => {
  const changedManifest = withFieldMetadata("variant", {
    options: [{ label: "Default", value: { first: 1, second: 2 } }],
  });
  const accountSchema = structuredClone(changedManifest.schema);
  const variant = accountSchema.fields.find((field) => field.slug === "variant");
  assert.ok(variant);
  variant.options = [{ label: "Default", value: { second: 2, first: 1 } }];
  const calls: string[] = [];
  const client = clientFor({ id: "hero-id", ...changedManifest, schema: accountSchema }, calls);

  assert.deepEqual(
    await syncBlockManifests(client, [changedManifest]),
    { created: 0, updated: 0 },
  );
  assert.deepEqual(calls, []);
});

test("requires boolean values for primary and list visibility metadata", () => {
  for (const property of ["is_primary", "show_in_list"]) {
    const malformed = withFieldMetadata("heading", { [property]: "yes" });
    assert.throws(() => validateBlockManifests([malformed]), /invalid (primary-field setting|list-visibility setting)/);
  }
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
