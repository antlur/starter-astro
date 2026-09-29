import { BackstageClient } from "@antlur/backstage";

export interface HeadlessBlock {
  id: string;
  type: string;
  variant?: string | null;
  fields: Record<string, unknown>;
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
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.type !== "string" || !isRecord(candidate.fields)) {
      throw new Error(
        "Page " + value.slug + " block " + blockIndex + " is not in the Headless block shape. " +
        "Set the account rendering mode to Headless and use account blocks with a fields object."
      );
    }

    return {
      id: candidate.id,
      type: candidate.type,
      variant: optionalString(candidate.variant),
      fields: candidate.fields,
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

  return {
    site: normalizeWebsite(websites[0]),
    pages: pages.map(normalizePage),
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
