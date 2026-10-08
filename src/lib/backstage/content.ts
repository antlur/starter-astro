import { BackstageClient } from "@antlur/backstage";
import type { AccountBlock, Alert, Field } from "@antlur/backstage";
import { BACKSTAGE_REQUEST_CONCURRENCY, mapWithConcurrency } from "./concurrency";
import { pageLayoutDefinitions } from "../../site/page-layout-definitions";
import { loadBlockManifests } from "./block-manifests";
import { attachBackstageForms } from "./forms";
import { normalizeLocation, type SiteLocation } from "./locations";
import { normalizeMenu, type SiteMenu } from "./menus";
import { normalizePublicPressReleases, type SitePressRelease } from "./press";
import { normalizeEvent, type SiteEvent } from "./events";
import { normalizeInstagramPosts, type SiteInstagramPost } from "./instagram";
import { assertLegacyPreviewConfiguration, collectLegacyPageMediaIds, normalizeLegacyPreviewPages } from "./legacy-page-preview";
import { validateBlockManifests, type BlockManifest } from "./sync-blocks";
import { previewRouteUrl, safeImageUrl, safeLinkUrl, safeSiteLinkUrl } from "../safe-url";
import { sanitizeRichText } from "../sanitize-rich-text";

export interface HeadlessBlock {
  id: string;
  type: string;
  variant?: string | null;
  fields: Record<string, unknown>;
  form?: BackstageFormDefinition;
  menu?: SiteMenu;
  events?: SiteEvent[];
  eventsIndexPath?: string | null;
  instagramPosts?: SiteInstagramPost[];
  instagramUrl?: string | null;
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
  type: "text" | "email" | "tel" | "textarea" | "date" | "time" | "number" | "select" | "checkbox" | "radio" | "file" | "url";
  required: boolean;
  options: Array<{ label: string; value: string }>;
}

export interface HeadlessPage {
  id: string;
  title: string;
  slug: string;
  pathname: string;
  is_home: boolean;
  settings: Record<string, unknown> | null;
  layout: HeadlessPageLayout | null;
  meta?: {
    title?: string | null;
    description?: string | null;
  } | null;
  blocks: HeadlessBlock[];
}

export interface HeadlessPageLayout {
  id: string;
  name: string;
  slug: string;
  schema: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface SiteNavigationItem {
  id: string;
  text: string;
  url: string;
  newWindow: boolean;
  style?: "link" | "button";
  menuId?: string;
  children: SiteNavigationItem[];
}

export interface HeadlessWebsite {
  name: string;
  domain: string | null;
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
  socialLinks: Array<{ name: string; url: string }>;
  homeCta: { text: string; url: string } | null;
}

export interface SiteContent {
  site: HeadlessWebsite;
  pages: HeadlessPage[];
  routePaths: string[];
  navigation: SiteNavigationItem[];
  footerNavigation: SiteNavigationItem[];
  alerts: Alert[];
  menus: SiteMenu[];
  locations: SiteLocation[];
  events: SiteEvent[];
  pressReleases: SitePressRelease[];
}

export type EditableBlockDefinition = Pick<AccountBlock, "slug" | "registry_identity"> & {
  schema?: { fields?: readonly Field[] };
};

const serializedOptions = (field: Field): string => JSON.stringify(
  (field.options ?? []).map(({ label, value }) => ({ label, value })),
);

const serializedFieldMetadata = (field: Field): string => JSON.stringify({
  name: field.name,
  description: field.description ?? null,
  placeholder: field.placeholder ?? null,
  order: field.order ?? null,
});

const assertBlockFieldParity = (
  blockType: string,
  localFields: readonly Field[],
  accountFields: readonly Field[],
  parent = "",
): void => {
  // Backstage currently drops required and resolves allowed_references to blueprint IDs.
  const fieldPath = (slug: string) => parent ? `${parent}.${slug}` : slug;
  const localFieldsBySlug = new Map(localFields.map((field) => [field.slug, field]));
  const accountFieldsBySlug = new Map(accountFields.map((field) => [field.slug, field]));

  if (accountFieldsBySlug.size !== accountFields.length) {
    throw new Error(`Backstage block "${blockType}" has duplicate field slugs in ${parent || "its schema"}.`);
  }

  const missingFields = localFields.filter((field) => !accountFieldsBySlug.has(field.slug));
  if (missingFields.length > 0) {
    throw new Error(
      `Backstage block "${blockType}" is missing fields from its local manifest: ${missingFields.map(({ slug }) => slug).join(", ")}. ` +
      "Reconcile its definition before building.",
    );
  }

  const unsupportedFields = accountFields.filter((field) => !localFieldsBySlug.has(field.slug));
  if (unsupportedFields.length > 0) {
    throw new Error(
      `Backstage block "${blockType}" has fields not supported by its local manifest: ${unsupportedFields.map(({ slug }) => slug).join(", ")}. ` +
      "Fork the semantic identity before adding fields.",
    );
  }

  for (const localField of localFields) {
    const accountField = accountFieldsBySlug.get(localField.slug);
    if (!accountField) continue;
    const path = fieldPath(localField.slug);

    if (serializedFieldMetadata(accountField) !== serializedFieldMetadata(localField)) {
      throw new Error(`Backstage block "${blockType}" field "${path}" has editor metadata that differs from its local manifest.`);
    }

    if (accountField.type !== localField.type) {
      throw new Error(
        `Backstage block "${blockType}" field "${path}" has type "${accountField.type}"; ` +
        `the local manifest expects "${localField.type}".`,
      );
    }

    if (serializedOptions(accountField) !== serializedOptions(localField)) {
      throw new Error(`Backstage block "${blockType}" field "${path}" has options that differ from its local manifest.`);
    }

    if (Boolean(accountField.is_multiple) !== Boolean(localField.is_multiple)) {
      throw new Error(`Backstage block "${blockType}" field "${path}" has a multiple-value setting that differs from its local manifest.`);
    }

    assertBlockFieldParity(blockType, localField.fields ?? [], accountField.fields ?? [], path);
  }
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

    assertBlockFieldParity(type, manifest.schema.fields, definition.schema?.fields ?? []);
  }
};

export const assertPageLayoutDefinitions = (
  pages: HeadlessPage[],
  customLayoutsEnabled: boolean,
): void => {
  const assignedLayouts = pages.flatMap((page) => page.layout ? [page.layout] : []);
  if (assignedLayouts.length === 0) return;

  if (!customLayoutsEnabled) {
    throw new Error(
      "This Headless site assigns page layouts, but CMS Custom Layouts is disabled for the Backstage account. " +
      "Enable that module before building so page layouts remain editable in Backstage.",
    );
  }

  for (const layout of assignedLayouts) {
    const definition = pageLayoutDefinitions.find((candidate) => candidate.slug === layout.slug);

    if (!definition) {
      throw new Error(
        `Backstage page layout "${layout.slug}" has no matching definition and Astro renderer in this starter.`,
      );
    }

    const accountFields = Array.isArray(layout.schema.fields) ? layout.schema.fields : [];
    const accountFieldsBySlug = new Map(accountFields.flatMap((field) =>
      isRecord(field) && typeof field.slug === "string" ? [[field.slug, field] as const] : [],
    ));
    const availableFields = new Set(accountFieldsBySlug.keys());
    const missingFields = definition.schema.fields
      .map((field) => field.slug)
      .filter((slug) => !availableFields.has(slug));

    if (missingFields.length > 0) {
      throw new Error(
        `Backstage page layout "${layout.slug}" is missing fields from its local definition: ${missingFields.join(", ")}. ` +
        "Run npm run sync:layouts, then build again.",
      );
    }

    const localFields = new Set(definition.schema.fields.map((field) => field.slug));
    const unsupportedFields = [...availableFields].filter((slug) => !localFields.has(slug));

    if (unsupportedFields.length > 0) {
      throw new Error(
        `Backstage page layout "${layout.slug}" has fields not supported by its local Astro renderer: ${unsupportedFields.join(", ")}. ` +
        "Update the local layout definition and renderer, or reconcile the Backstage definition before building.",
      );
    }

    for (const localField of definition.schema.fields) {
      const accountField = accountFieldsBySlug.get(localField.slug);
      if (!accountField) continue;

      if (accountField.type !== localField.type) {
        throw new Error(
          `Backstage page layout "${layout.slug}" field "${localField.slug}" has type "${String(accountField.type)}"; ` +
          `the local Astro renderer expects "${localField.type}". Reconcile the local and Backstage definitions before building.`,
        );
      }

      if (localField.options) {
        const localOptions = localField.options.map(({ value }) => String(value)).sort();
        const accountOptions = Array.isArray(accountField.options)
          ? accountField.options.flatMap((option) =>
              isRecord(option) && option.value !== undefined ? [String(option.value)] : [],
            ).sort()
          : [];

        if (JSON.stringify(accountOptions) !== JSON.stringify(localOptions)) {
          throw new Error(
            `Backstage page layout "${layout.slug}" field "${localField.slug}" has options that differ from its local Astro definition. ` +
            "Reconcile the local and Backstage definitions before building.",
          );
        }
      }
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeObject = (value: unknown, context: string): Record<string, unknown> => {
  if (isRecord(value)) return value;
  if (Array.isArray(value) && value.length === 0) return {};
  throw new Error(context + " must be object-shaped.");
};

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const menuSelectionId = (value: unknown): string | null =>
  optionalString(isRecord(value) ? value.id : value);

const rewritePreviewLinks = (
  value: unknown,
  siteDomain: string | null,
  routePaths: readonly string[],
  key = "",
): unknown => {
  if (typeof value === "string") {
    if (/<a\b/i.test(value)) return sanitizeRichText(value, { siteDomain, routePaths });
    if (["href", "url", "button_url", "link_url", "cta_url"].includes(key)) {
      return previewRouteUrl(value, siteDomain, routePaths) ?? value;
    }
    return value;
  }

  if (Array.isArray(value)) return value.map((child) => rewritePreviewLinks(child, siteDomain, routePaths));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
      childKey,
      rewritePreviewLinks(child, siteDomain, routePaths, childKey),
    ]));
  }

  return value;
};

const rewritePreviewNavigation = (
  items: SiteNavigationItem[],
  siteDomain: string | null,
  routePaths: readonly string[],
): SiteNavigationItem[] => items.map((item) => ({
  ...item,
  url: previewRouteUrl(item.url, siteDomain, routePaths) ?? item.url,
  children: rewritePreviewNavigation(item.children, siteDomain, routePaths),
}));

const collectMenuMediaIds = (menus: unknown[]): string[] => {
  const ids = new Set<string>();

  for (const menu of menus) {
    if (!isRecord(menu) || !Array.isArray(menu.categories)) continue;
    for (const category of menu.categories) {
      if (!isRecord(category) || !Array.isArray(category.items)) continue;
      for (const item of category.items) {
        if (!isRecord(item)) continue;
        const globalItem = isRecord(item.menu_item) ? item.menu_item : {};
        const hasLocalImageOverride = item.image !== undefined || item.image_id !== undefined;
        const imageSource = hasLocalImageOverride ? item : globalItem;
        if (safeImageUrl(imageSource.image) || imageSource.image_id === undefined || imageSource.image_id === null) continue;
        ids.add(String(imageSource.image_id));
      }
    }
  }

  return [...ids];
};

const loadMenuMedia = async (client: BackstageClient, ids: string[]): Promise<Map<string, unknown>> => {
  const mediaById = new Map<string, unknown>();

  for (let offset = 0; offset < ids.length; offset += 8) {
    const batch = ids.slice(offset, offset + 8);
    const media = await Promise.all(batch.map(async (id) => [id, await client.media.get(id)] as const));
    for (const [id, value] of media) {
      if (value) mediaById.set(id, value);
    }
  }

  if (mediaById.size < ids.length) {
    console.warn(`Backstage menu references ${ids.length - mediaById.size} media item(s) that could not be resolved.`);
  }

  return mediaById;
};

const loadLegacyPageMedia = async (client: BackstageClient, ids: string[]): Promise<Map<string, unknown>> => {
  const mediaById = new Map<string, unknown>();

  for (let offset = 0; offset < ids.length; offset += 8) {
    const media = await Promise.all(ids.slice(offset, offset + 8).map(async (id) => [id, await client.media.get(id)] as const));
    for (const [id, value] of media) {
      if (value) mediaById.set(id, value);
    }
  }

  if (mediaById.size < ids.length) {
    console.warn(`Backstage legacy pages reference ${ids.length - mediaById.size} media item(s) that could not be resolved.`);
  }

  return mediaById;
};

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

  const settings = value.settings === null || value.settings === undefined
    ? null
    : normalizeObject(value.settings, "Backstage page " + value.slug + " settings");
  let layout: HeadlessPageLayout | null = null;

  if (value.layout !== null && value.layout !== undefined) {
    if (
      !isRecord(value.layout)
      || typeof value.layout.id !== "string"
      || typeof value.layout.name !== "string"
      || typeof value.layout.slug !== "string"
      || !isRecord(value.layout.schema)
    ) {
      throw new Error("Backstage page " + value.slug + " has an invalid assigned layout.");
    }

    layout = {
      id: value.layout.id,
      name: value.layout.name,
      slug: value.layout.slug,
      schema: value.layout.schema,
      data: normalizeObject(value.layout.data, "Backstage page " + value.slug + " layout data"),
    };
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
    settings,
    layout,
    meta: meta
      ? {
          title: optionalString(meta.title),
          description: optionalString(meta.description),
        }
      : null,
    blocks,
  };
};

export const attachMenusToBlocks = (pages: HeadlessPage[], menus: SiteMenu[]): void => {
  const menusById = new Map(menus.map((menu) => [menu.id, menu]));

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type !== "menu") continue;

      const menuId = menuSelectionId(block.fields.menu_id);
      if (!menuId) {
        throw new Error(`Backstage Menu block "${block.id}" on page "${page.slug}" has no selected menu.`);
      }

      const menu = menusById.get(menuId);
      if (!menu) {
        throw new Error(`Backstage Menu block "${block.id}" references menu ${menuId} that was not loaded.`);
      }

      block.menu = menu;
    }
  }
};

export const attachEventsToBlocks = (pages: HeadlessPage[], events: SiteEvent[], routePaths: string[]): void => {
  const configuredPath = routePaths.find((path) => path === "/events" || path === "/events/") ?? null;
  const indexPath = configuredPath && !configuredPath.endsWith("/") ? `${configuredPath}/` : configuredPath;

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type !== "upcoming-events") continue;
      block.events = events;
      block.eventsIndexPath = indexPath;
    }
  }
};

const normalizeNavigationUrl = (value: unknown): string => {
  const url = typeof value === "string" ? value.trim() : "";
  const normalized = safeSiteLinkUrl(url);
  if (normalized) return normalized;

  if (!url) throw new Error("Backstage navigation contains an item without a URL.");
  throw new Error("Backstage navigation contains an unsupported URL: " + url);
};

const normalizeNavigationItem = (value: unknown): SiteNavigationItem => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    throw new Error("Backstage returned an invalid navigation item.");
  }

  if (value.children !== undefined && !Array.isArray(value.children)) {
    throw new Error("Backstage navigation item " + value.id + " has an invalid children list.");
  }

  const menuId = optionalString(value.menu_id) ?? (isRecord(value.menu) ? optionalString(value.menu.id) : null);

  return {
    id: value.id,
    text: value.text,
    url: normalizeNavigationUrl(value.url),
    newWindow: value.new_window === true,
    style: value.style === "button" ? "button" : "link",
    ...(menuId ? { menuId } : {}),
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
  const logo = isRecord(value.logo) && safeImageUrl(value.logo.url) ? value.logo : null;
  const socialLinks = Array.isArray(value.social_links)
    ? value.social_links.flatMap((candidate) => {
        if (!isRecord(candidate) || typeof candidate.name !== "string") return [];
        const url = safeLinkUrl(candidate.url);
        return url?.startsWith("https://") ? [{ name: candidate.name.trim(), url }] : [];
      })
    : [];
  const homeCtaText = optionalString(value.home_cta_text);
  const homeCtaUrl = safeSiteLinkUrl(value.home_cta_url);

  return {
    name: optionalString(account?.name) ?? optionalString(value.app_name) ?? "Website",
    domain: optionalString(value.domain),
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
          image: safeImageUrl(openGraph.image),
        }
      : null,
    logo: logo
      ? {
          url: safeImageUrl(logo.url) as string,
          width: typeof logo.width === "number" ? logo.width : undefined,
          height: typeof logo.height === "number" ? logo.height : undefined,
        }
      : null,
    faviconUrl: safeImageUrl(value.favicon_url),
    appleIconUrl: safeImageUrl(value.apple_icon_url),
    socialLinks,
    homeCta: homeCtaText && homeCtaUrl ? { text: homeCtaText, url: homeCtaUrl } : null,
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
  const legacyPreview = assertLegacyPreviewConfiguration(
    source,
    import.meta.env.BACKSTAGE_PAGE_MODE,
    import.meta.env.SITE_INDEXABLE === "true",
  );

  if (source === "fixture") {
    const { fixtureSiteContent } = await import("../../fixtures/site-content");
    return fixtureSiteContent;
  }

  if (source !== "api") {
    throw new Error("Set BACKSTAGE_SOURCE to api or fixture before building the site.");
  }

  const client = getBackstageClient();

  const [websites, rawPages, routePaths, navigations, rawLocations, alerts] = await Promise.all([
    client.website.getWebsites(),
    legacyPreview ? client.pages.getPages() : client.pages.getHeadlessPages(),
    client.website.routes(),
    client.navigation.list(),
    client.locations.getLocations(),
    client.alerts.getAlerts(),
  ]);

  if (!Array.isArray(websites) || websites.length !== 1) {
    throw new Error(
      "This starter expects exactly one Backstage website per account. The current Pages SDK does not filter pages by website yet."
    );
  }

  if (!Array.isArray(rawPages)) {
    throw new Error("Backstage did not return a pages collection.");
  }
  if (!Array.isArray(routePaths)) throw new Error("Backstage did not return a routes collection.");
  if (!Array.isArray(rawLocations)) throw new Error("Backstage did not return a locations collection.");
  if (!Array.isArray(alerts)) throw new Error("Backstage did not return an alerts collection.");

  const pagePayloads = legacyPreview
    ? normalizeLegacyPreviewPages(rawPages, await loadLegacyPageMedia(client, collectLegacyPageMediaIds(rawPages)))
    : rawPages;
  const normalizedPages = pagePayloads.map(normalizePage);
  const website = normalizeWebsite(websites[0]);
  const pageMenuIds = normalizedPages.flatMap((page) => page.blocks.flatMap((block) => {
    if (block.type !== "menu") return [];
    const menuId = menuSelectionId(block.fields.menu_id);
    return menuId ? [menuId] : [];
  }));

  if (legacyPreview) {
    for (const page of normalizedPages) {
      for (const block of page.blocks) {
        block.fields = rewritePreviewLinks(block.fields, website.domain, routePaths) as Record<string, unknown>;
      }
    }
    if (website.homeCta) {
      website.homeCta.url = previewRouteUrl(website.homeCta.url, website.domain, routePaths) ?? website.homeCta.url;
    }
  }

  const rawWebsite: Record<string, unknown> = isRecord(websites[0]) ? websites[0] : {};
  const requestedNavigationId = import.meta.env.BACKSTAGE_NAVIGATION_ID?.trim()
    || optionalString(rawWebsite.header_navigation_id)
    || undefined;
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

  const footerNavigationId = optionalString(rawWebsite.footer_navigation_id);
  let footerNavigation: SiteNavigationItem[] = [];
  if (footerNavigationId && footerNavigationId !== requestedNavigationId) {
    if (!navigations.some((candidate) => candidate.id === footerNavigationId)) {
      throw new Error("The Backstage website references a footer navigation that is missing from the account.");
    }
    footerNavigation = normalizeNavigation(await client.navigation.getNavigation(footerNavigationId));
  }

  if (legacyPreview) {
    navigation = rewritePreviewNavigation(navigation, website.domain, routePaths);
    footerNavigation = rewritePreviewNavigation(footerNavigation, website.domain, routePaths);
  }

  const navigationItems = (items: SiteNavigationItem[]): SiteNavigationItem[] =>
    items.flatMap((item) => [item, ...navigationItems(item.children)]);
  const navigationMenuIds = [...new Set([...navigationItems(navigation), ...navigationItems(footerNavigation)].flatMap((item) => item.menuId ? [item.menuId] : []))];
  const publicMenuSlugs = new Set(routePaths.flatMap((path) => {
    const match = /^\/menu\/([^/]+)\/?$/.exec(path);
    return match ? [match[1]] : [];
  }));
  const locationMenuIds = rawLocations.flatMap((location) =>
    isRecord(location) && Array.isArray(location.menus)
      ? location.menus.flatMap((menu) => isRecord(menu) && typeof menu.id === "string" ? [menu.id] : [])
      : [],
  );
  let menuSummaries: unknown[] = [];
  if (navigationMenuIds.length > 0 || pageMenuIds.length > 0 || routePaths.some((path) => path === "/menu" || path.startsWith("/menu/"))) {
    const response: unknown = await client.menus.getMenus();
    if (!Array.isArray(response)) throw new Error("Backstage did not return a menus collection.");
    menuSummaries = response;
  }
  const routeMenuIds = menuSummaries.flatMap((menu) =>
    isRecord(menu) && typeof menu.id === "string" && typeof menu.slug === "string" && publicMenuSlugs.has(menu.slug)
      ? [menu.id]
      : [],
  );
  const indexMenuIds = publicMenuSlugs.size === 0 && routePaths.some((path) => path === "/menu" || path === "/menu/")
    ? locationMenuIds
    : [];
  const menuIds = [...new Set([...pageMenuIds, ...navigationMenuIds, ...routeMenuIds, ...indexMenuIds])];
  const rawMenus = await mapWithConcurrency(menuIds, BACKSTAGE_REQUEST_CONCURRENCY, async (id) => {
    try {
      const response: unknown = await client.menus.getMenu(id);
      const menu = Array.isArray(response)
        ? response.find((candidate) => isRecord(candidate) && String(candidate.id) === id)
        : response;

      if (!menu) throw new Error("The linked menu was not found.");
      return menu;
    } catch (error) {
      throw new Error(`Could not load Backstage menu ${id} linked from a page block or navigation.`, { cause: error });
    }
  });
  const menuMedia = await loadMenuMedia(client, collectMenuMediaIds(rawMenus));
  const menus = rawMenus.map((menu, index) => normalizeMenu(menu, index, menuMedia));
  attachMenusToBlocks(normalizedPages, menus);
  const locations = rawLocations.map(normalizeLocation);

  const hasPressRoutes = routePaths.some((path) => path === "/press" || path.startsWith("/press/"));
  let pressReleases: SitePressRelease[] = [];

  if (hasPressRoutes) {
    let pressModuleEnabled: boolean;
    try {
      pressModuleEnabled = await client.modules.isEnabled("engagement.press");
    } catch (error) {
      throw new Error(
        "Could not verify the Backstage Press module. Check that the API token can read account modules.",
        { cause: error },
      );
    }
    if (!pressModuleEnabled) {
      throw new Error("This site has public Press routes, but the Backstage Press module is disabled.");
    }

    let rawPress: unknown;
    try {
      rawPress = await client.press.getPress();
    } catch (error) {
      throw new Error("Could not read press items from Backstage.", { cause: error });
    }
    if (!Array.isArray(rawPress)) throw new Error("Backstage did not return a press collection.");
    pressReleases = normalizePublicPressReleases(rawPress, routePaths);
  }

  if (!legacyPreview && normalizedPages.some((page) => page.blocks.length > 0)) {
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

  if (!legacyPreview && normalizedPages.some((page) => page.layout !== null)) {
    let customLayoutsEnabled: boolean;

    try {
      customLayoutsEnabled = await client.modules.isEnabled("cms.custom_layouts");
    } catch (error) {
      throw new Error(
        "Could not verify CMS Custom Layouts in Backstage. Check that the API token can read account modules.",
        { cause: error },
      );
    }

    assertPageLayoutDefinitions(normalizedPages, customLayoutsEnabled);
  }

  const hasUpcomingEvents = normalizedPages.some((page) =>
    page.blocks.some((block) => block.type === "upcoming-events"),
  );
  const hasEventRoutes = routePaths.some((path) => path === "/events" || path.startsWith("/events/"));
  let events: SiteEvent[] = [];
  if (hasUpcomingEvents || hasEventRoutes) {
    let eventsModuleEnabled: boolean;
    try {
      eventsModuleEnabled = await client.modules.isEnabled("engagement.events");
    } catch (error) {
      throw new Error(
        "Could not verify the Backstage Events module. Check that the API token can read account modules.",
        { cause: error },
      );
    }
    if (!eventsModuleEnabled) {
      throw new Error("This site uses an Upcoming Events block, but the Backstage Events module is disabled.");
    }

    let rawEvents: unknown;
    try {
      rawEvents = await client.events.getEvents();
    } catch (error) {
      throw new Error("Could not read events from Backstage.", { cause: error });
    }
    if (!Array.isArray(rawEvents)) throw new Error("Backstage did not return an events collection.");
    const publicEventPaths = new Map(routePaths.flatMap((path) => {
      const match = /^\/events\/([^/]+)\/?$/.exec(path);
      if (!match) return [];
      try {
        const normalizedPath = `/${path.split("/").filter(Boolean).join("/")}/`;
        return [[decodeURIComponent(match[1]), normalizedPath] as const];
      } catch {
        return [];
      }
    }));
    events = rawEvents.map(normalizeEvent).map((event) => ({
      ...event,
      publicPath: publicEventPaths.get(event.slug) ?? null,
    }));
    attachEventsToBlocks(normalizedPages, events, routePaths);
  }

  const instagramBlocks = normalizedPages.flatMap((page) => page.blocks.filter((block) => block.type === "instagram-feed"));
  const instagramProfile = website.socialLinks.find((link) => link.name.toLowerCase() === "instagram")?.url ?? null;
  const shouldLoadInstagram = instagramBlocks.length > 0 || (legacyPreview && Boolean(instagramProfile));
  let instagramPosts: SiteInstagramPost[] = [];

  if (shouldLoadInstagram) {
    try {
      instagramPosts = normalizeInstagramPosts(await client.instagram.latest());
    } catch (error) {
      if (instagramBlocks.length > 0) {
        throw new Error("Could not load Instagram posts required by an Instagram Feed block.", { cause: error });
      }
      console.warn("Could not load the optional Instagram feed for this Legacy Preview.");
    }
  }

  for (const block of instagramBlocks) {
    block.instagramPosts = instagramPosts;
    block.instagramUrl = instagramProfile;
  }

  if (legacyPreview && instagramPosts.length > 0 && instagramProfile) {
    const homePage = normalizedPages.find((page) => page.is_home);
    if (homePage && !homePage.blocks.some((block) => block.type === "instagram-feed")) {
      homePage.blocks.push({
        id: "legacy-preview-instagram-feed",
        type: "instagram-feed",
        fields: { eyebrow: "Follow along", heading: "On Instagram", count: 6 },
        instagramPosts,
        instagramUrl: instagramProfile,
      });
    }
  }

  return {
    site: website,
    pages: await attachBackstageForms(normalizedPages, client),
    routePaths,
    menus,
    locations,
    events,
    pressReleases,
    navigation,
    footerNavigation,
    alerts,
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
