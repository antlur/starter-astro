import type { AccountBlockSchema, BackstageClient, Field } from "@antlur/backstage";
import type { FieldType } from "@antlur/backstage/studio";

export interface BlockManifest {
  manifest_version: 1;
  type: "block";
  registry_identity: string;
  derived_from?: string | null;
  name: string;
  slug: string;
  description?: string;
  schema: AccountBlockSchema & { fields: readonly Field[] };
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

export interface BlockSyncOptions {
  adoptUnregisteredSlugs?: string[];
}

const identityPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*@[1-9][0-9]*$/;
const supportedFieldTypes: Record<FieldType, true> = {
  boolean: true,
  date: true,
  datetime: true,
  email: true,
  event_select: true,
  fieldset: true,
  form_select: true,
  image: true,
  image_list: true,
  json: true,
  list_array: true,
  location: true,
  markdown: true,
  media: true,
  menu_select: true,
  number: true,
  press_select: true,
  reference: true,
  repeater: true,
  rich_text: true,
  select: true,
  separator: true,
  slug: true,
  spacer: true,
  text: true,
  textarea: true,
  time: true,
  url: true,
  navigation_select: true,
  page_select: true,
};

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSchemaFields(fields: unknown[], blockSlug: string, parent = "schema.fields"): void {
  const slugs = new Set<string>();

  for (const [index, field] of fields.entries()) {
    if (
      !isRecord(field)
      || typeof field.name !== "string"
      || field.name.trim() === ""
      || typeof field.slug !== "string"
      || field.slug.trim() === ""
      || typeof field.type !== "string"
      || field.type.trim() === ""
    ) {
      throw new Error(`Block manifest "${blockSlug}" has an invalid ${parent}[${index}]; each field needs a name, slug, and type.`);
    }

    if (!Object.hasOwn(supportedFieldTypes, field.type)) {
      throw new Error(`Block manifest "${blockSlug}" has unsupported field type "${field.type}" for "${field.slug}" in ${parent}.`);
    }

    if (slugs.has(field.slug)) {
      throw new Error(`Block manifest "${blockSlug}" has duplicate field slug "${field.slug}" in ${parent}.`);
    }
    slugs.add(field.slug);

    if (field.required !== undefined && typeof field.required !== "boolean") {
      throw new Error(`Block manifest "${blockSlug}" has an invalid required setting for "${field.slug}".`);
    }

    if (field.is_multiple !== undefined && typeof field.is_multiple !== "boolean") {
      throw new Error(`Block manifest "${blockSlug}" has an invalid multiple-value setting for "${field.slug}".`);
    }

    if (field.allowed_references !== undefined && (!Array.isArray(field.allowed_references)
      || field.allowed_references.some((reference) => typeof reference !== "string"))) {
      throw new Error(`Block manifest "${blockSlug}" has invalid reference targets for "${field.slug}".`);
    }

    if (field.options !== undefined && (!Array.isArray(field.options)
      || field.options.some((option) => !isRecord(option)
        || typeof option.label !== "string"
        || option.label.trim() === ""
        || !Object.hasOwn(option, "value")))) {
      throw new Error(`Block manifest "${blockSlug}" has invalid options for "${field.slug}".`);
    }

    if (field.fields !== undefined) {
      if (!Array.isArray(field.fields)) {
        throw new Error(`Block manifest "${blockSlug}" has invalid nested fields for "${field.slug}".`);
      }
      validateSchemaFields(field.fields, blockSlug, `${parent}.${field.slug}.fields`);
    }
  }
}

export function validateBlockManifests(manifests: unknown[]): asserts manifests is BlockManifest[] {
  if (manifests.length === 0) throw new Error("No block manifests were found.");

  const identities = new Set<string>();
  const slugs = new Set<string>();

  for (const candidate of manifests) {
    if (
      !isRecord(candidate)
      || candidate.manifest_version !== 1
      || candidate.type !== "block"
      || typeof candidate.registry_identity !== "string"
      || !identityPattern.test(candidate.registry_identity)
      || typeof candidate.name !== "string"
      || candidate.name.trim() === ""
      || typeof candidate.slug !== "string"
      || candidate.slug.trim() === ""
      || !isRecord(candidate.schema)
      || !Array.isArray(candidate.schema.fields)
    ) {
      throw new Error("A block manifest is missing valid identity, name, slug, or schema fields.");
    }

    const { registry_identity: registryIdentity, slug } = candidate;
    validateSchemaFields(candidate.schema.fields as unknown[], slug);

    if (identities.has(registryIdentity) || slugs.has(slug)) {
      throw new Error(`Block manifests must use unique identities and slugs; check "${slug}".`);
    }

    identities.add(registryIdentity);
    slugs.add(slug);
  }
}

export async function syncBlockManifests(
  client: BlockSyncClient,
  manifests: BlockManifest[],
  options: BlockSyncOptions = {},
) {
  validateBlockManifests(manifests);
  const adoptUnregisteredSlugs = new Set(options.adoptUnregisteredSlugs ?? []);
  const manifestSlugs = new Set(manifests.map((manifest) => manifest.slug));

  for (const slug of adoptUnregisteredSlugs) {
    if (!manifestSlugs.has(slug)) {
      throw new Error(`Cannot adopt "${slug}" because this starter has no matching block manifest.`);
    }
  }

  let blocks = await client.blocks.list() as RegisteredBlock[];

  const findExisting = (manifest: BlockManifest): RegisteredBlock | undefined => {
    const matches = blocks.filter((block) => block.registry_identity === manifest.registry_identity);

    if (matches.length > 1) {
      throw new Error(`Backstage returned multiple blocks with identity "${manifest.registry_identity}".`);
    }

    const existing = matches[0];

    if (existing && existing.slug !== manifest.slug) {
      throw new Error(`Cannot rename "${manifest.registry_identity}" from "${existing.slug}"; authored pages may reference its slug.`);
    }

    const slugOwner = blocks.find((block) => block.slug === manifest.slug && block.id !== existing?.id);

    if (slugOwner) {
      if (!slugOwner.registry_identity && adoptUnregisteredSlugs.has(manifest.slug)) {
        return slugOwner;
      }

      const owner = slugOwner.registry_identity ?? `unregistered block ${slugOwner.id}`;
      throw new Error(`Slug "${manifest.slug}" is already owned by ${owner}. Refusing to overwrite it.`);
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
