import { BackstageClient } from "@antlur/backstage";
import type { AccountBlock } from "@antlur/backstage";
import { loadBlockManifests } from "./block-manifests";
import { attachBackstageForms } from "./forms";
import { validateBlockManifests, type BlockManifest } from "./sync-blocks";

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
  pathname: string;
  is_home: boolean;
  meta?: {
    title?: string | null;
    description?: string | null;
  } | null;
  blocks: HeadlessBlock[];
}

export interface SiteNavigationItem {
  id: string;
  text: string;
  url: string;
  newWindow: boolean;
  children: SiteNavigationItem[];
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
  routePaths: string[];
  navigation: SiteNavigationItem[];
}

export type EditableBlockDefinition = Pick<AccountBlock, "slug" | "registry_identity"> & {
  schema?: { fields?: readonly { slug: string }[] };
};

export const assertPageBlockDefinitions = (
  pages: HeadlessPage[],
  customBlocksEnabled: boolean,
  definitions: EditableBlockDefinition[],
  localManifests?: BlockManifest[],
): void => {
  const blockTypes = [...new Set(pages.flatMap((page) => page.blocks.map((block) => block.type)))];

  if (blockTypes.length === 0) return;

  const manifests = localManifests ?? loadBlockManifests();
  validateBlockManifests(manifests);

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
    const manifest = manifests.find((candidate) => candidate.slug === type);
    const definition = definitions.find((candidate) => candidate.slug === type);

    if (!manifest || !definition) {
      throw new Error(`Block type "${type}" has no matching local application manifest.`);
    }

    if (definition.registry_identity !== manifest.registry_identity) {
      throw new Error(
        `Backstage block "${type}" is not registered to ${manifest.registry_identity}. ` +
        "Resolve the existing definition before syncing so the local project does not overwrite an unrelated block.",
      );
    }

    const availableFields = new Set(definition.schema?.fields?.map((field) => field.slug) ?? []);
    const missingFields = manifest.schema.fields
      .map((field) => field.slug)
      .filter((field) => !availableFields.has(field));

    if (missingFields.length > 0) {
      throw new Error(
        `Backstage block "${type}" is missing fields from its local manifest: ${missingFields.join(", ")}. ` +
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
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.title !== "string"
    || typeof value.slug !== "string"
    || typeof value.pathname !== "string"
  ) {
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
    pathname: value.pathname,
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

const normalizeNavigationUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Backstage navigation contains an item without a URL.");
  }

  const url = value.trim();

  if (url.startsWith("#")) return url;

  if (url.startsWith("/") && !url.startsWith("//")) {
    const parsed = new URL(url, "https://backstage.invalid");
    const path = parsed.pathname === "/" ? "/" : `/${parsed.pathname.split("/").filter(Boolean).join("/")}/`;

    return path + parsed.search + parsed.hash;
  }

  try {
    const parsed = new URL(url);

    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return url;
  } catch {
    // Invalid URL values are rejected by the common error below.
  }

  throw new Error("Backstage navigation contains an unsupported URL: " + url);
};

const normalizeNavigationItem = (value: unknown): SiteNavigationItem => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    throw new Error("Backstage returned an invalid navigation item.");
  }

  if (value.children !== undefined && !Array.isArray(value.children)) {
    throw new Error("Backstage navigation item " + value.id + " has an invalid children list.");
  }

  return {
    id: value.id,
    text: value.text,
    url: normalizeNavigationUrl(value.url),
    newWindow: value.new_window === true,
    children: (value.children ?? []).map(normalizeNavigationItem),
  };
};

export const normalizeNavigation = (value: unknown): SiteNavigationItem[] => {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Backstage returned an invalid navigation definition.");
  }

  return value.items.map(normalizeNavigationItem);
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
let backstageClient: BackstageClient | undefined;

const getBackstageClient = (): BackstageClient => {
  if (backstageClient) return backstageClient;

  const token = import.meta.env.BACKSTAGE_API_KEY;
  const accountId = import.meta.env.BACKSTAGE_ACCOUNT_ID;

  if (!token || !accountId) {
    throw new Error("BACKSTAGE_API_KEY and BACKSTAGE_ACCOUNT_ID are required when BACKSTAGE_SOURCE=api.");
  }

  backstageClient = new BackstageClient({
    baseURL: import.meta.env.BACKSTAGE_API_URL || "https://bckstg.app/api",
    token,
    accountId,
  });

  return backstageClient;
};

export const resolveBackstageRoute = async (path: string): Promise<unknown> => {
  if (import.meta.env.BACKSTAGE_SOURCE === "fixture") {
    const { fixtureRouteResolutions } = await import("../../fixtures/routes");
    return fixtureRouteResolutions[path] ?? {
      type: "fixture",
      data: null,
      meta: { id: null, type: "fixture", path },
    };
  }

  if (import.meta.env.BACKSTAGE_SOURCE !== "api") throw new Error("Backstage route resolution requires an API or fixture source.");

  return await getBackstageClient().routes.resolve<unknown>(path);
};

export const getSiteContent = (): Promise<SiteContent> => {
  contentPromise ??= loadSiteContent();
  return contentPromise;
};

const loadSiteContent = async (): Promise<SiteContent> => {
  const source = import.meta.env.BACKSTAGE_SOURCE;

  if (source === "fixture") {
    const { fixtureSiteContent } = await import("../../fixtures/site-content");
    return fixtureSiteContent;
  }

  if (source !== "api") {
    throw new Error("Set BACKSTAGE_SOURCE to api or fixture before building the site.");
  }

  const client = getBackstageClient();

  const [websites, pages, routePaths, navigations] = await Promise.all([
    client.website.getWebsites(),
    client.pages.getHeadlessPages(),
    client.website.routes(),
    client.navigation.list(),
  ]);

  if (!Array.isArray(websites) || websites.length !== 1) {
    throw new Error(
      "This starter expects exactly one Backstage website per account. The current Pages SDK does not filter pages by website yet."
    );
  }

  if (!Array.isArray(pages)) {
    throw new Error("Backstage did not return a pages collection.");
  }

  const normalizedPages = pages.map(normalizePage);

  const requestedNavigationId = import.meta.env.BACKSTAGE_NAVIGATION_ID?.trim();
  let navigation: SiteNavigationItem[];

  if (requestedNavigationId) {
    if (!navigations.some((candidate) => candidate.id === requestedNavigationId)) {
      throw new Error("BACKSTAGE_NAVIGATION_ID does not match a navigation in this account.");
    }

    navigation = normalizeNavigation(await client.navigation.getNavigation(requestedNavigationId));
  } else if (navigations.length > 1) {
    throw new Error("This account has multiple navigations. Set BACKSTAGE_NAVIGATION_ID to choose one.");
  } else if (navigations.length === 1) {
    navigation = normalizeNavigation(await client.navigation.getNavigation(navigations[0].id));
  } else {
    navigation = [];
  }

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
        definitions = await client.blocks.list();
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
    routePaths,
    navigation: navigation.length > 0
      ? navigation
      : normalizedPages.map((page) => ({
          id: page.id,
          text: page.title,
          url: normalizeNavigationUrl(page.pathname),
          newWindow: false,
          children: [],
        })),
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
