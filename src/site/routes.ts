import type { HeadlessPage, SiteContent, SiteNavigationItem } from "../lib/backstage/content";
import { normalizeEvent, type SiteEvent } from "../lib/backstage/events";
import { normalizeLocation, type SiteLocation } from "../lib/backstage/locations";
import { normalizeMenu, type SiteMenu } from "../lib/backstage/menus";
import { normalizePressRelease, type SitePressRelease } from "../lib/backstage/press";
import type { BlueprintRoute } from "./blueprint-routes";

export interface CmsPageRoute {
  path: string;
  page: HeadlessPage;
}

export interface SiteRoutePlan {
  cmsPages: CmsPageRoute[];
  blueprintRoutes: BlueprintRoute[];
  applicationPaths: string[];
  menuRoutes: Array<{ path: string; label: string; menu: SiteMenu }>;
  menuIndexPaths: string[];
  eventRoutes: Array<{ path: string; kind: "index" } | { path: string; kind: "detail"; event: SiteEvent }>;
  locationRoutes: Array<{ path: string; location: SiteLocation }>;
  locationIndexPaths: string[];
  pressRoutes: Array<
    | { path: string; kind: "index" }
    | { path: string; kind: "detail"; release: SitePressRelease }
  >;
  unhandledPaths: string[];
  navigation: SiteNavigationItem[];
  footerNavigation: SiteNavigationItem[];
}

export interface ResolvedSiteRoute {
  path: string;
  value: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const pageForCanonicalRoute = (
  path: string,
  resolution: unknown,
  pages: HeadlessPage[],
): HeadlessPage | null => {
  if (!isRecord(resolution) || resolution.type !== "page" || !isRecord(resolution.meta) || !isRecord(resolution.data)) return null;
  if (resolution.meta.type !== "page" || typeof resolution.meta.path !== "string") return null;

  const canonicalPath = normalizeRoutePath(path);
  if (normalizeRoutePath(resolution.meta.path) !== canonicalPath) {
    throw new Error(`Backstage resolved ${path} to a different canonical page path.`);
  }

  const resolvedId = resolution.data.id;
  if (typeof resolvedId !== "string" && typeof resolvedId !== "number") return null;
  const page = pages.find((candidate) => candidate.id === String(resolvedId));

  return page ? { ...page, pathname: canonicalPath } : null;
};

export const resolveCanonicalPageRoutes = async (
  paths: readonly string[],
  pages: HeadlessPage[],
  resolver: (path: string) => Promise<unknown>,
): Promise<{ pages: HeadlessPage[]; unhandledPaths: string[]; resolutions: ResolvedSiteRoute[] }> => {
  const resolved = await Promise.all(paths.map(async (path) => ({ path, value: await resolver(path) })));
  const routedPages: HeadlessPage[] = [];
  const unhandledPaths: string[] = [];

  for (const { path, value } of resolved) {
    const page = pageForCanonicalRoute(path, value, pages);
    if (page) routedPages.push(page);
    else unhandledPaths.push(path);
  }

  return { pages: routedPages, unhandledPaths, resolutions: resolved };
};

export const addResolvedModuleContent = (
  content: SiteContent,
  resolutions: readonly ResolvedSiteRoute[],
): SiteContent => {
  const menus = [...content.menus];
  const locations = [...content.locations];
  const events = [...content.events];
  const pressReleases = [...content.pressReleases];
  const detailPaths = new Map<string, string>();

  for (const entry of resolutions) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta)) continue;
    const { type, id, path } = entry.value.meta;
    if ((type === "event" || type === "press") && (typeof id === "string" || typeof id === "number") && typeof path === "string") {
      detailPaths.set(`${type}:${id}`, normalizeRoutePath(path));
    }
  }

  const replaceOrAppend = <T extends { id: string }>(items: T[], item: T): void => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
  };

  for (const entry of resolutions) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta)) continue;
    const path = normalizeRoutePath(entry.path);
    if (typeof entry.value.meta.path !== "string" || normalizeRoutePath(entry.value.meta.path) !== path) {
      throw new Error(`Backstage resolved ${path} to a different canonical route path.`);
    }

    const type = entry.value.meta.type;
    const id = entry.value.meta.id;
    const data = entry.value.data;

    if (type === "events" && Array.isArray(data)) {
      for (const [index, value] of data.entries()) {
        const event = normalizeEvent(value, index);
        replaceOrAppend(events, {
          ...event,
          publicPath: detailPaths.get(`event:${event.id}`) ?? event.publicPath,
        });
      }
      continue;
    }

    if (type === "presses" && Array.isArray(data)) {
      for (const [index, value] of data.entries()) {
        const release = normalizePressRelease(value, index);
        replaceOrAppend(pressReleases, {
          ...release,
          publicPath: detailPaths.get(`press:${release.id}`) ?? release.publicPath,
        });
      }
      continue;
    }

    if (type === "locations" && Array.isArray(data)) {
      for (const [index, value] of data.entries()) {
        replaceOrAppend(locations, normalizeLocation(value, index));
      }
      continue;
    }

    if (typeof id !== "string" && typeof id !== "number") continue;
    const recordId = String(id);

    if (type === "menu" && !menus.some((menu) => menu.id === recordId)) {
      const menu = normalizeMenu(data);
      if (menu.id !== recordId) throw new Error(`Backstage resolved ${path} to a different menu ID.`);
      menus.push(menu);
    } else if (type === "location") {
      const location = normalizeLocation(data);
      if (location.id !== recordId) throw new Error(`Backstage resolved ${path} to a different location ID.`);
      replaceOrAppend(locations, location);
    } else if (type === "event") {
      const event = normalizeEvent(data);
      if (event.id !== recordId) throw new Error(`Backstage resolved ${path} to a different event ID.`);
      replaceOrAppend(events, { ...event, publicPath: path });
    } else if (type === "press") {
      const release = normalizePressRelease(data);
      if (release.id !== recordId) throw new Error(`Backstage resolved ${path} to a different press ID.`);
      replaceOrAppend(pressReleases, { ...release, publicPath: path });
    }
  }

  return { ...content, menus, locations, events, pressReleases };
};

// Add paths backed by Astro-owned route files, such as a custom /private-events/ page.
export const applicationRoutePaths: readonly string[] = [];

export const normalizeRoutePath = (value: string): string => {
  if (
    !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("?")
    || value.includes("#")
    || value.includes("\\")
    || value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Site routes must be safe absolute paths: " + value);
  }

  const segments = value.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
};

const normalizeUniquePaths = (paths: readonly string[], source: string): string[] => {
  const normalized = paths.map(normalizeRoutePath);
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const path of normalized) {
    if (seen.has(path)) duplicates.add(path);
    seen.add(path);
  }

  if (duplicates.size > 0) {
    throw new Error(`${source} contains duplicate routes: ${[...duplicates].join(", ")}.`);
  }

  return normalized;
};

const navigationPath = (url: string): string | null => {
  if (!url.startsWith("/")) return null;
  return normalizeRoutePath(new URL(url, "https://backstage.invalid").pathname);
};

const filterNavigation = (
  items: SiteNavigationItem[],
  availablePaths: Set<string>,
): SiteNavigationItem[] => items.flatMap((item) => {
  const path = navigationPath(item.url);

  if (path && !availablePaths.has(path)) return [];

  return [{
    ...item,
    children: filterNavigation(item.children, availablePaths),
  }];
});

const flattenNavigation = (items: SiteNavigationItem[]): SiteNavigationItem[] =>
  items.flatMap((item) => [item, ...flattenNavigation(item.children)]);

export const buildSiteRoutePlan = (
  content: SiteContent,
  applicationPaths: readonly string[] = applicationRoutePaths,
  blueprintRoutes: readonly BlueprintRoute[] = [],
  resolvedRoutes: readonly ResolvedSiteRoute[] = [],
): SiteRoutePlan => {
  const normalizedRoutePaths = content.routePaths.map(normalizeRoutePath);
  const routeCounts = new Map<string, number>();
  for (const path of normalizedRoutePaths) routeCounts.set(path, (routeCounts.get(path) ?? 0) + 1);
  const routePaths = [...new Set(normalizedRoutePaths)];
  const cmsPagePaths = new Set(content.pages.map((page) => normalizeRoutePath(page.pathname)));
  const eventsBySlug = new Map(content.events.map((event) => [event.slug, event]));
  const eventRoutes: SiteRoutePlan["eventRoutes"] = [];

  for (const path of routePaths) {
    if (path === "/events/" && !cmsPagePaths.has(path)) {
      eventRoutes.push({ path, kind: "index" });
      continue;
    }
    const eventMatch = /^\/events\/([^/]+)\/$/.exec(path);
    if (!eventMatch) continue;
    const event = eventsBySlug.get(decodeURIComponent(eventMatch[1]));
    if (event) eventRoutes.push({ path, kind: "detail", event });
  }

  // Backstage can expose a CMS page and the generated Events index at the same path.
  // When both route rows are present, the later system route is the public owner.
  const hasGeneratedEventsIndex = (routeCounts.get("/events/") ?? 0) > 1;
  if (hasGeneratedEventsIndex && !eventRoutes.some((route) => route.path === "/events/")) {
    eventRoutes.unshift({ path: "/events/", kind: "index" });
  }

  const menusById = new Map(content.menus.map((menu) => [menu.id, menu]));
  const menuRoutesByPath = new Map<string, { path: string; label: string; menu: SiteMenu }>();
  for (const item of flattenNavigation(content.navigation)) {
    if (!item.menuId) continue;
    const path = navigationPath(item.url);
    if (!path || !routePaths.includes(path)) continue;
    const menu = menusById.get(item.menuId);
    if (!menu) throw new Error(`Backstage navigation item "${item.text}" references menu ${item.menuId}, but the menu was not loaded.`);
    menuRoutesByPath.set(path, { path, label: item.text, menu });
  }
  const menuBySlug = new Map(content.menus.map((menu) => [menu.slug, menu]));
  for (const path of routePaths) {
    const match = /^\/menu\/([^/]+)\/$/.exec(path);
    if (!match) continue;
    const menu = menuBySlug.get(decodeURIComponent(match[1]));
    if (menu && !menuRoutesByPath.has(path)) menuRoutesByPath.set(path, { path, label: menu.title, menu });
  }
  for (const entry of resolvedRoutes) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta) || typeof entry.value.meta.type !== "string") continue;
    const path = normalizeRoutePath(entry.path);
    if (typeof entry.value.meta.path !== "string" || normalizeRoutePath(entry.value.meta.path) !== path) {
      throw new Error(`Backstage resolved ${path} to a different canonical route path.`);
    }

    const type = entry.value.meta.type;
    const id = entry.value.meta.id;
    if (type === "events" && !eventRoutes.some((route) => route.path === path)) {
      eventRoutes.push({ path, kind: "index" });
    } else if (type === "event" && (typeof id === "string" || typeof id === "number")) {
      const event = content.events.find((candidate) => candidate.id === String(id));
      if (event && !eventRoutes.some((route) => route.path === path)) {
        eventRoutes.push({ path, kind: "detail", event: { ...event, publicPath: path } });
      }
    } else if (type === "menu" && (typeof id === "string" || typeof id === "number")) {
      const menu = menusById.get(String(id));
      if (menu && !menuRoutesByPath.has(path)) {
        const navigationItem = flattenNavigation(content.navigation).find((item) => navigationPath(item.url) === path && item.menuId === String(id));
        menuRoutesByPath.set(path, { path, label: navigationItem?.text ?? menu.title, menu });
      }
    }
  }
  const menuRoutes = [...menuRoutesByPath.values()];
  const menuIndexPaths = routePaths.filter((path) =>
    path === "/menu/" && !cmsPagePaths.has(path) && menuRoutes.length > 0
      && !menuRoutes.some((route) => route.path === path),
  );
  const locationRoutes: SiteRoutePlan["locationRoutes"] = [];
  const locationIndexPaths: string[] = [];
  if (content.locations.length === 1 && routePaths.includes("/location/") && !cmsPagePaths.has("/location/")) {
    locationRoutes.push({ path: "/location/", location: content.locations[0] });
  }
  for (const path of routePaths) {
    if (locationRoutes.some((route) => route.path === path)) continue;
    if (path.startsWith("/events/") || path.startsWith("/menu/") || path.startsWith("/press/")) continue;
    const location = content.locations.find((candidate) => candidate.slug && path.split("/").filter(Boolean).at(-1) === candidate.slug);
    if (location && !cmsPagePaths.has(path)) locationRoutes.push({ path, location });
  }
  for (const entry of resolvedRoutes) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta)) continue;
    const path = normalizeRoutePath(entry.path);
    if (entry.value.meta.type === "locations") {
      if (!locationIndexPaths.includes(path)) locationIndexPaths.push(path);
      continue;
    }
    if (entry.value.meta.type !== "location") continue;
    const id = entry.value.meta.id;
    const location = (typeof id === "string" || typeof id === "number")
      ? content.locations.find((candidate) => candidate.id === String(id))
      : undefined;
    if (location && !locationRoutes.some((route) => route.path === path)) locationRoutes.push({ path, location });
  }

  const pressBySlug = new Map(content.pressReleases.map((release) => [release.slug, release]));
  const pressRoutes: SiteRoutePlan["pressRoutes"] = [];
  for (const path of routePaths) {
    if (path === "/press/") {
      pressRoutes.push({ path, kind: "index" });
      continue;
    }
    if (!path.startsWith("/press/")) continue;

    const slug = path.slice("/press/".length, -1);
    const release = pressBySlug.get(slug);
    if (release) pressRoutes.push({ path, kind: "detail", release });
  }
  for (const entry of resolvedRoutes) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta) || typeof entry.value.meta.type !== "string") continue;
    const path = normalizeRoutePath(entry.path);
    const type = entry.value.meta.type;
    const id = entry.value.meta.id;
    if (type === "presses" && !pressRoutes.some((route) => route.path === path)) {
      pressRoutes.push({ path, kind: "index" });
    } else if (type === "press" && (typeof id === "string" || typeof id === "number")) {
      const release = content.pressReleases.find((candidate) => candidate.id === String(id));
      if (release && !pressRoutes.some((route) => route.path === path)) {
        pressRoutes.push({ path, kind: "detail", release: { ...release, publicPath: path } });
      }
    }
  }
  const generatedRoutes = [
    ...menuRoutes.map(({ path }) => path),
    ...menuIndexPaths,
    ...eventRoutes.map(({ path }) => path),
    ...locationRoutes.map(({ path }) => path),
    ...locationIndexPaths,
    ...pressRoutes.map(({ path }) => path),
  ];
  const duplicatePaths = [...routeCounts].filter(([, count]) => count > 1).map(([path]) => path);
  const hasDuplicateEventsIndex = hasGeneratedEventsIndex
    && eventRoutes.some((route) => route.path === "/events/" && route.kind === "index");
  const unsupportedDuplicates = duplicatePaths.filter((path) => !(path === "/events/" && hasDuplicateEventsIndex));
  if (unsupportedDuplicates.length > 0) {
    throw new Error(`Backstage site graph contains duplicate routes: ${unsupportedDuplicates.join(", ")}.`);
  }

  const appPaths = normalizeUniquePaths(
    [...applicationPaths, ...generatedRoutes],
    "Application routes",
  );
  const appPathSet = new Set(appPaths);
  const blueprintPaths = normalizeUniquePaths(blueprintRoutes.map(({ path }) => path), "Resolved Backstage blueprint routes");
  const blueprintPathSet = new Set(blueprintPaths);
  const pagesByPath = new Map<string, HeadlessPage>();

  for (const path of blueprintPaths) {
    if (!routePaths.includes(path)) {
      throw new Error(`Resolved Backstage blueprint route ${path} is not in the public site graph.`);
    }
    if (appPathSet.has(path) && !duplicatePaths.includes(path)) {
      throw new Error(`Application route ${path} collides with a Backstage blueprint route.`);
    }
  }

  for (const page of content.pages) {
    const path = normalizeRoutePath(page.pathname);

    if (pagesByPath.has(path)) {
      throw new Error(`Multiple Backstage pages resolve to ${path}.`);
    }

    if (appPathSet.has(path) && !duplicatePaths.includes(path)) {
      throw new Error(`Application route ${path} collides with a Backstage CMS page.`);
    }
    if (blueprintPathSet.has(path)) {
      throw new Error(`Backstage blueprint route ${path} collides with a Backstage CMS page.`);
    }
    if (appPathSet.has(path)) continue;

    pagesByPath.set(path, page);
  }

  if (!routePaths.includes("/")) {
    throw new Error("The Backstage site graph does not include the homepage at /.");
  }

  const homePages = content.pages.filter((page) => page.is_home);

  if (homePages.length !== 1 || normalizeRoutePath(homePages[0].pathname) !== "/") {
    throw new Error("Expected exactly one Backstage homepage at /.");
  }

  const cmsPages: CmsPageRoute[] = [];
  const unhandledPaths: string[] = [];

  for (const path of routePaths) {
    const page = pagesByPath.get(path);

    if (page) {
      cmsPages.push({ path, page });
    } else if (!appPathSet.has(path) && !blueprintPathSet.has(path)) {
      unhandledPaths.push(path);
    }
  }

  const availablePaths = new Set([...cmsPages.map(({ path }) => path), ...appPaths, ...blueprintPaths]);

  return {
    cmsPages,
    blueprintRoutes: [...blueprintRoutes],
    applicationPaths: appPaths,
    menuRoutes,
    menuIndexPaths,
    eventRoutes,
    locationRoutes,
    locationIndexPaths,
    pressRoutes,
    unhandledPaths,
    navigation: filterNavigation(content.navigation, availablePaths),
    footerNavigation: filterNavigation(content.footerNavigation, availablePaths),
  };
};

export const reportUnhandledRoutes = (paths: readonly string[], indexable: boolean): void => {
  if (paths.length === 0) return;

  const message =
    "Backstage routes are not rendered by this Astro app: " + paths.join(", ") +
    ". Add Astro route files and list their paths in src/site/routes.ts.";

  if (indexable) throw new Error(message);
  console.warn(message);
};
