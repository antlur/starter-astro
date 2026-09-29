import type { AccountBlockSchema, BackstageClient } from "@antlur/backstage";

export interface BlockManifest {
  manifest_version: 1;
  type: "block";
  registry_identity: string;
  derived_from?: string | null;
  name: string;
  slug: string;
  description?: string;
  schema: AccountBlockSchema;
}

interface RegisteredBlock {
  id: string;
  slug: string;
  registry_identity?: string | null;
}

type SyncPayload = {
  name: string;
  slug: string;
  description?: string;
  schema: BlockManifest["schema"];
  registry_identity: string;
  derived_from?: string | null;
};

export type BlockSyncClient = Pick<BackstageClient, "blocks">;

const identityPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*@[1-9][0-9]*$/;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

function validateManifests(manifests: BlockManifest[]): void {
  if (manifests.length === 0) throw new Error("No block manifests were found.");

  const identities = new Set<string>();
  const slugs = new Set<string>();

  for (const manifest of manifests) {
    if (
      manifest.manifest_version !== 1
      || manifest.type !== "block"
      || !identityPattern.test(manifest.registry_identity)
      || !manifest.name
      || !manifest.slug
      || !Array.isArray(manifest.schema?.fields)
    ) {
      throw new Error("A block manifest is missing valid identity, name, slug, or schema fields.");
    }

    if (identities.has(manifest.registry_identity) || slugs.has(manifest.slug)) {
      throw new Error(`Block manifests must use unique identities and slugs; check "${manifest.slug}".`);
    }

    identities.add(manifest.registry_identity);
    slugs.add(manifest.slug);
  }
}

export async function syncBlockManifests(client: BlockSyncClient, manifests: BlockManifest[]) {
  validateManifests(manifests);
  let blocks = await client.blocks.list() as RegisteredBlock[];

  const findExisting = (manifest: BlockManifest): RegisteredBlock | undefined => {
    const matches = blocks.filter((block) => block.registry_identity === manifest.registry_identity);

    if (matches.length > 1) {
      throw new Error(`Backstage returned multiple blocks with identity "${manifest.registry_identity}".`);
    }

    const existing = matches[0];
    const slugOwner = blocks.find((block) => block.slug === manifest.slug && block.id !== existing?.id);

    if (slugOwner) {
      const owner = slugOwner.registry_identity ?? `unregistered block ${slugOwner.id}`;
      throw new Error(`Slug "${manifest.slug}" is already owned by ${owner}. Refusing to overwrite it.`);
    }

    if (existing && existing.slug !== manifest.slug) {
      throw new Error(`Cannot rename "${manifest.registry_identity}" from "${existing.slug}"; authored pages may reference its slug.`);
    }

    return existing;
  };

  const result = { created: 0, updated: 0 };

  for (const manifest of manifests) {
    const payload: SyncPayload = {
      name: manifest.name,
      slug: manifest.slug,
      description: manifest.description,
      schema: manifest.schema,
      registry_identity: manifest.registry_identity,
      ...(manifest.derived_from !== undefined ? { derived_from: manifest.derived_from } : {}),
    };
    const existing = findExisting(manifest);

    if (existing) {
      await client.blocks.update(existing.id, payload);
      result.updated += 1;
      continue;
    }

    try {
      await client.blocks.create(payload);
      result.created += 1;
    } catch (error) {
      if (statusOf(error) !== 409) throw error;

      blocks = await client.blocks.list() as RegisteredBlock[];
      const racedBlock = findExisting(manifest);

      if (!racedBlock) {
        throw new Error(`Slug "${manifest.slug}" conflicted, but no matching registered block was found in this account.`);
      }

      await client.blocks.update(racedBlock.id, payload);
      result.updated += 1;
    }
  }

  return result;
}
