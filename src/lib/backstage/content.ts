import { BackstageClient } from "@antlur/backstage";
import contactFormManifest from "../../../blocks/contact-form/manifest.json";
import heroManifest from "../../../blocks/hero/manifest.json";
import richTextManifest from "../../../blocks/rich-text/manifest.json";
import { attachBackstageForms } from "./forms";

export interface HeadlessBlock {
  id: string;
  type: string;
  variant?: string | null;
  fields: Record<string, unknown>;
  form?: BackstageFormDefinition;
}

export interface BackstageFormDefinition {
  id: string;
  title: string;
  action: string;
  recaptchaSiteKey: string | null;
  fields: BackstageFormField[];
}

export interface BackstageFormField {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "date" | "number" | "select" | "checkbox" | "radio" | "file" | "url";
  required: boolean;
  options: Array<{ label: string; value: string }>;
}

export interface HeadlessPage {
  id: string;
  title: string;
  slug: string;
  is_home: boolean;
  meta?: {
    title?: string | null;
    description?: string | null;
  } | null;
  blocks: HeadlessBlock[];
}

export interface HeadlessWebsite {
  name: string;
  meta?: {
    title?: string | null;
    description?: string | null;
  } | null;
  openGraph?: {
    title?: string | null;
    description?: string | null;
    image?: string | null;
  } | null;
  logo?: {
    url: string;
    width?: number;
    height?: number;
  } | null;
  faviconUrl?: string | null;
  appleIconUrl?: string | null;
}

export interface SiteContent {
  site: HeadlessWebsite;
  pages: HeadlessPage[];
}

export interface EditableBlockDefinition {
  slug: string;
  registry_identity?: string | null;
  schema?: { fields?: Array<{ slug: string }> };
}

const starterBlockManifests = [contactFormManifest, heroManifest, richTextManifest];

export const assertPageBlockDefinitions = (
  pages: HeadlessPage[],
  customBlocksEnabled: boolean,
  definitions: EditableBlockDefinition[],
): void => {
  const blockTypes = [...new Set(pages.flatMap((page) => page.blocks.map((block) => block.type)))];

  if (blockTypes.length === 0) return;

  if (!customBlocksEnabled) {
    throw new Error(
      "This Headless site has page blocks, but CMS Custom Blocks is disabled for the Backstage account. " +
      "Enable that module before building so the blocks remain editable in Backstage.",
    );
  }

  const missingTypes = blockTypes.filter((type) => !definitions.some((definition) => definition.slug === type));

  if (missingTypes.length > 0) {
    throw new Error(
      "Backstage has no synced Custom Block definition for: " + missingTypes.join(", ") + ". " +
      "Run npm run sync:blocks for this account, then build again.",
    );
  }

  for (const type of blockTypes) {
    const manifest = starterBlockManifests.find((candidate) => candidate.slug === type);
    const definition = definitions.find((candidate) => candidate.slug === type);

    if (!manifest || !definition) {
      throw new Error(`Block type "${type}" has no matching local starter manifest.`);
    }

    if (definition.registry_identity !== manifest.registry_identity) {
      throw new Error(
        `Backstage block "${type}" is not registered to ${manifest.registry_identity}. ` +
        "Resolve the existing definition before syncing so the starter does not overwrite an unrelated block.",
      );
    }

    const availableFields = new Set(definition.schema?.fields?.map((field) => field.slug) ?? []);
    const missingFields = manifest.schema.fields
      .map((field) => field.slug)
      .filter((field) => !availableFields.has(field));

    if (missingFields.length > 0) {
      throw new Error(
        `Backstage block "${type}" is missing fields from its starter manifest: ${missingFields.join(", ")}. ` +
        "Reconcile its definition before building.",
      );
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export const normalizePage = (value: unknown, index = 0): HeadlessPage => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.slug !== "string") {
    throw new Error("Backstage returned an invalid page at index " + index + ".");
  }

  if (!Array.isArray(value.blocks)) {
    throw new Error("Backstage page " + value.slug + " has no blocks array.");
  }

  const blocks = value.blocks.map((candidate, blockIndex): HeadlessBlock => {
    const fields = isRecord(candidate?.fields)
      ? candidate.fields
      : Array.isArray(candidate?.fields) && candidate.fields.length === 0
        ? {}
        : null;

    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.type !== "string" || !fields) {
      throw new Error(
        "Page " + value.slug + " block " + blockIndex + " is not in the Headless block shape. " +
        "Set the account rendering mode to Headless and use account blocks with a fields object."
      );
    }

    return {
      id: candidate.id,
      type: candidate.type,
      variant: optionalString(candidate.variant),
      fields,
    };
  });

  const meta = isRecord(value.meta) ? value.meta : null;

  return {
    id: value.id,
    title: value.title,
    slug: value.slug,
    is_home: value.is_home === true,
    meta: meta
      ? {
          title: optionalString(meta.title),
          description: optionalString(meta.description),
        }
      : null,
    blocks,
  };
};

export const normalizeWebsite = (value: unknown): HeadlessWebsite => {
  if (!isRecord(value)) {
    throw new Error("Backstage did not return a website for this account.");
  }

  const account = isRecord(value.account) ? value.account : null;
  const meta = isRecord(value.meta) ? value.meta : null;
  const openGraph = isRecord(value.open_graph) ? value.open_graph : null;
  const logo = isRecord(value.logo) && typeof value.logo.url === "string" ? value.logo : null;

  return {
    name: optionalString(account?.name) ?? optionalString(value.app_name) ?? "Website",
    meta: meta
      ? {
          title: optionalString(meta.title),
          description: optionalString(meta.description),
        }
      : null,
    openGraph: openGraph
      ? {
          title: optionalString(openGraph.title),
          description: optionalString(openGraph.description),
          image: optionalString(openGraph.image),
        }
      : null,
    logo: logo
      ? {
          url: logo.url as string,
          width: typeof logo.width === "number" ? logo.width : undefined,
          height: typeof logo.height === "number" ? logo.height : undefined,
        }
      : null,
    faviconUrl: optionalString(value.favicon_url),
    appleIconUrl: optionalString(value.apple_icon_url),
  };
};

let contentPromise: Promise<SiteContent> | undefined;

export const getSiteContent = (): Promise<SiteContent> => {
  contentPromise ??= loadSiteContent();
  return contentPromise;
};

const loadSiteContent = async (): Promise<SiteContent> => {
  const source = import.meta.env.BACKSTAGE_SOURCE;

  if (source === "fixture") {
    const { fixtureContent } = await import("../../fixtures/content");
    return fixtureContent;
  }

  if (source !== "api") {
    throw new Error("Set BACKSTAGE_SOURCE to api or fixture before building the site.");
  }

  const token = import.meta.env.BACKSTAGE_API_KEY;
  const accountId = import.meta.env.BACKSTAGE_ACCOUNT_ID;

  if (!token || !accountId) {
    throw new Error("BACKSTAGE_API_KEY and BACKSTAGE_ACCOUNT_ID are required when BACKSTAGE_SOURCE=api.");
  }

  const client = new BackstageClient({
    baseURL: import.meta.env.BACKSTAGE_API_URL || "https://bckstg.app/api",
    token,
    accountId,
  });

  const [websites, pages] = await Promise.all([client.website.getWebsites(), client.pages.getPages()]);

  if (!Array.isArray(websites) || websites.length !== 1) {
    throw new Error(
      "This starter expects exactly one Backstage website per account. The current Pages SDK does not filter pages by website yet."
    );
  }

  if (!Array.isArray(pages)) {
    throw new Error("Backstage did not return a pages collection.");
  }

  const normalizedPages = pages.map(normalizePage);

  if (normalizedPages.some((page) => page.blocks.length > 0)) {
    let customBlocksEnabled: boolean;

    try {
      customBlocksEnabled = await client.modules.isEnabled("cms.custom_blocks");
    } catch (error) {
      throw new Error(
        "Could not verify CMS Custom Blocks in Backstage. Check that the API token can read account modules.",
        { cause: error },
      );
    }

    let definitions: EditableBlockDefinition[] = [];

    if (customBlocksEnabled) {
      try {
        // The API returns registry_identity; the published SDK type has not caught up yet.
        definitions = await client.blocks.list() as EditableBlockDefinition[];
      } catch (error) {
        throw new Error(
          "Could not read Custom Block definitions from Backstage. Check that the API token can read account blocks.",
          { cause: error },
        );
      }
    }

    assertPageBlockDefinitions(normalizedPages, customBlocksEnabled, definitions);
  }

  return {
    site: normalizeWebsite(websites[0]),
    pages: await attachBackstageForms(normalizedPages, client),
  };
};

export const getHomePage = (pages: HeadlessPage[]): HeadlessPage => {
  const matches = pages.filter((candidate) => candidate.is_home);

  if (matches.length !== 1) {
    throw new Error("Expected exactly one Backstage homepage; found " + matches.length + ".");
  }

  return matches[0];
};

export const getPageBySlug = (pages: HeadlessPage[], slug: string): HeadlessPage => {
  const normalizedSlug = slug.replace(/^\/+|\/+$/g, "");
  const matches = pages.filter((candidate) => candidate.slug.replace(/^\/+|\/+$/g, "") === normalizedSlug);

  if (matches.length !== 1) {
    throw new Error("Expected exactly one Backstage CMS page for slug " + slug + "; found " + matches.length + ".");
  }

  return matches[0];
};
