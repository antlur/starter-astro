import type { HeadlessPage, SiteContent, SiteNavigationItem } from "../lib/backstage/content";
import { normalizeEvent, resolveEventTimezone, type SiteEvent } from "../lib/backstage/events";
import { normalizeLocation, type SiteLocation } from "../lib/backstage/locations";
import { normalizeMenu, type SiteMenu } from "../lib/backstage/menus";
import { normalizePressRelease, type SitePressRelease } from "../lib/backstage/press";
import { BACKSTAGE_REQUEST_CONCURRENCY, mapWithConcurrency } from "../lib/backstage/concurrency";
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
  eventsIndexPath: string | null;
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
  const resolved = await mapWithConcurrency(paths, BACKSTAGE_REQUEST_CONCURRENCY, async (path) => ({ path, value: await resolver(path) }));
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
    if ((type !== "event" && type !== "press") || (typeof id !== "string" && typeof id !== "number")) continue;
    const resolvedPath = normalizeRoutePath(entry.path);
    if (typeof path !== "string" || normalizeRoutePath(path) !== resolvedPath) continue;
    detailPaths.set(`${type}:${id}`, resolvedPath);
  }

  const replaceOrAppend = <T extends { id: string }>(items: T[], item: T): void => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
  };

  const replaceResolvedEvent = (event: SiteEvent, publicPath?: string): void => {
    const existingEvent = events.find((candidate) => candidate.id === event.id);
    replaceOrAppend(events, {
      ...event,
      timezone: event.timezone ?? existingEvent?.timezone ?? null,
      publicPath: publicPath ?? existingEvent?.publicPath ?? event.publicPath,
    });
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
        replaceResolvedEvent(event, detailPaths.get(`event:${event.id}`));
      }
      continue;
    }

    if (type === "presses" && Array.isArray(data)) {
      for (const [index, value] of data.entries()) {
        const releaseId = isRecord(value) && (typeof value.id === "string" || typeof value.id === "number")
          ? String(value.id)
          : null;
        const publicPath = releaseId ? detailPaths.get(`press:${releaseId}`) : undefined;
        if (!publicPath) continue;

        const release = normalizePressRelease(value, index);
        replaceOrAppend(pressReleases, { ...release, publicPath });
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
      replaceResolvedEvent(event, path);
    } else if (type === "press") {
      const release = normalizePressRelease(data);
      if (release.id !== recordId) throw new Error(`Backstage resolved ${path} to a different press ID.`);
      replaceOrAppend(pressReleases, { ...release, publicPath: path });
    }
  }

  const locationTimezones = locations.map((location) => location.timezone);
  const enrichedEvents = events.map((event) => ({
    ...event,
    timezone: resolveEventTimezone(event.timezone, locationTimezones),
  }));

  return { ...content, menus, locations, events: enrichedEvents, pressReleases };
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

const uniqueSlugMatch = <T extends { slug: string | null }>(items: readonly T[], slug: string): T | undefined => {
  const matches = items.filter((item) => item.slug === slug);
  return matches.length === 1 ? matches[0] : undefined;
};

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
  const canonicalRoutesByPath = new Map<string, { type: string; id: string | null }>();
  for (const entry of resolvedRoutes) {
    if (!isRecord(entry.value) || !isRecord(entry.value.meta) || typeof entry.value.meta.type !== "string") continue;
    const path = normalizeRoutePath(entry.path);
    if (typeof entry.value.meta.path !== "string" || normalizeRoutePath(entry.value.meta.path) !== path) {
      throw new Error(`Backstage resolved ${path} to a different canonical route path.`);
    }

    const type = entry.value.meta.type;
    const rawId = entry.value.meta.id;
    const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : null;
    const existing = canonicalRoutesByPath.get(path);
    if (existing && (existing.type !== type || existing.id !== id)) {
      throw new Error(`Backstage returned multiple canonical route owners for ${path}.`);
    }
    canonicalRoutesByPath.set(path, { type, id });
  }

  const isCanonicalOwner = (path: string): boolean => {
    const route = canonicalRoutesByPath.get(path);
    return Boolean(route && route.type !== "fixture");
  };
  const slugOwnerCount = (slug: string): number =>
    content.events.filter((item) => item.slug === slug).length
      + content.menus.filter((item) => item.slug === slug).length
      + content.locations.filter((item) => item.slug === slug).length
      + content.pressReleases.filter((item) => item.slug === slug).length;

  const eventRoutes: SiteRoutePlan["eventRoutes"] = [];
  const menuRoutesByPath = new Map<string, { path: string; label: string; menu: SiteMenu }>();
  const menusById = new Map(content.menus.map((menu) => [menu.id, menu]));
  const locationRoutes: SiteRoutePlan["locationRoutes"] = [];
  const locationIndexPaths: string[] = [];
  const pressRoutes: SiteRoutePlan["pressRoutes"] = [];
  const ownedPaths = new Set(routePaths.filter(isCanonicalOwner));

  const navigationItems = flattenNavigation(content.navigation);
  for (const item of navigationItems) {
    if (!item.menuId) continue;
    const path = navigationPath(item.url);
    if (!path || !routePaths.includes(path) || ownedPaths.has(path)) continue;
    const menu = menusById.get(item.menuId);
    if (!menu) throw new Error(`Backstage navigation item "${item.text}" references menu ${item.menuId}, but the menu was not loaded.`);
    if (!menuRoutesByPath.has(path)) menuRoutesByPath.set(path, { path, label: item.text, menu });
    ownedPaths.add(path);
  }

  for (const path of routePaths) {
    const route = canonicalRoutesByPath.get(path);
    if (!route || !isCanonicalOwner(path)) continue;

    if (route.type === "events") {
      eventRoutes.push({ path, kind: "index" });
    } else if (route.type === "event" && route.id !== null) {
      const event = content.events.find((candidate) => candidate.id === route.id);
      if (event) eventRoutes.push({ path, kind: "detail", event: { ...event, publicPath: path } });
    } else if (route.type === "menu" && route.id !== null) {
      const menu = menusById.get(route.id);
      if (menu) {
        const navigationItem = navigationItems.find((item) =>
          navigationPath(item.url) === path && item.menuId === route.id,
        );
        menuRoutesByPath.set(path, { path, label: navigationItem?.text ?? menu.title, menu });
      }
    } else if (route.type === "location" && route.id !== null) {
      const location = content.locations.find((candidate) => candidate.id === route.id);
      if (location) locationRoutes.push({ path, location });
    } else if (route.type === "locations") {
      locationIndexPaths.push(path);
    } else if (route.type === "presses") {
      pressRoutes.push({ path, kind: "index" });
    } else if (route.type === "press" && route.id !== null) {
      const release = content.pressReleases.find((candidate) => candidate.id === route.id);
      if (release) pressRoutes.push({ path, kind: "detail", release: { ...release, publicPath: path } });
    }
  }

  const canonicalEventsIndexPaths = routePaths.filter((path) => canonicalRoutesByPath.get(path)?.type === "events");

  for (const path of routePaths) {
    if (ownedPaths.has(path)) continue;

    if (path === "/events/" && !cmsPagePaths.has(path) && canonicalEventsIndexPaths.length === 0) {
      eventRoutes.push({ path, kind: "index" });
      ownedPaths.add(path);
      continue;
    }
    const eventMatch = /^\/events\/([^/]+)\/$/.exec(path);
    if (!eventMatch) continue;
    const slug = decodeURIComponent(eventMatch[1]);
    if (slugOwnerCount(slug) !== 1) continue;
    const event = uniqueSlugMatch(content.events, slug);
    if (event) {
      eventRoutes.push({ path, kind: "detail", event });
      ownedPaths.add(path);
    }
  }

  // Preserve the legacy Events index fallback only when canonical resolution did
  // not identify another route as the owner of this duplicate path.
  const eventsIndexOwner = canonicalRoutesByPath.get("/events/");
  const hasGeneratedEventsIndex = (routeCounts.get("/events/") ?? 0) > 1
    && canonicalEventsIndexPaths.length === 0
    && (!eventsIndexOwner || eventsIndexOwner.type === "events");
  if (hasGeneratedEventsIndex && !eventRoutes.some((route) => route.path === "/events/")) {
    eventRoutes.unshift({ path: "/events/", kind: "index" });
    ownedPaths.add("/events/");
  }

  for (const path of routePaths) {
    if (ownedPaths.has(path)) continue;
    const match = /^\/menu\/([^/]+)\/$/.exec(path);
    if (!match) continue;
    const slug = decodeURIComponent(match[1]);
    if (slugOwnerCount(slug) !== 1) continue;
    const menu = uniqueSlugMatch(content.menus, slug);
    if (menu) {
      menuRoutesByPath.set(path, { path, label: menu.title, menu });
      ownedPaths.add(path);
    }
  }
  const navigationPathOrder = new Map<string, number>();
  navigationItems.forEach((item, index) => {
    const path = navigationPath(item.url);
    if (path && !navigationPathOrder.has(path)) navigationPathOrder.set(path, index);
  });
  const routePathOrder = new Map(routePaths.map((path, index) => [path, index]));
  const menuRoutes = [...menuRoutesByPath.values()].sort((left, right) => {
    const leftNavigationOrder = navigationPathOrder.get(left.path);
    const rightNavigationOrder = navigationPathOrder.get(right.path);
    if (leftNavigationOrder !== undefined || rightNavigationOrder !== undefined) {
      if (leftNavigationOrder === undefined) return 1;
      if (rightNavigationOrder === undefined) return -1;
      if (leftNavigationOrder !== rightNavigationOrder) return leftNavigationOrder - rightNavigationOrder;
    }
    return (routePathOrder.get(left.path) ?? 0) - (routePathOrder.get(right.path) ?? 0);
  });
  const menuIndexPaths = routePaths.filter((path) =>
    path === "/menu/" && !ownedPaths.has(path) && !cmsPagePaths.has(path) && menuRoutes.length > 0
      && !menuRoutes.some((route) => route.path === path),
  );

  for (const path of routePaths) {
    if (ownedPaths.has(path)) continue;
    if (content.locations.length === 1 && path === "/location/" && !cmsPagePaths.has(path)) {
      locationRoutes.push({ path, location: content.locations[0] });
      ownedPaths.add(path);
      continue;
    }

    const segments = path.split("/").filter(Boolean);
    const isLocationCollectionPath = segments.length === 2 && ["location", "locations"].includes(segments[0]);
    if (segments.length !== 1 && !isLocationCollectionPath) continue;
    const slug = decodeURIComponent(segments.at(-1)!);
    if (slugOwnerCount(slug) !== 1) continue;
    const location = uniqueSlugMatch(content.locations, slug);
    if (location && !cmsPagePaths.has(path)) {
      locationRoutes.push({ path, location });
      ownedPaths.add(path);
    }
  }

  for (const path of routePaths) {
    if (ownedPaths.has(path)) continue;
    if (path === "/press/") {
      pressRoutes.push({ path, kind: "index" });
      ownedPaths.add(path);
      continue;
    }
    const match = /^\/press\/([^/]+)\/$/.exec(path);
    if (!match) continue;
    const slug = decodeURIComponent(match[1]);
    if (slugOwnerCount(slug) !== 1) continue;
    const release = uniqueSlugMatch(content.pressReleases, slug);
    if (release) {
      pressRoutes.push({ path, kind: "detail", release });
      ownedPaths.add(path);
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
  const unsupportedDuplicates = duplicatePaths.filter((path) =>
    !isCanonicalOwner(path) && !(path === "/events/" && hasDuplicateEventsIndex),
  );
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
    const canonicalRoute = canonicalRoutesByPath.get(path);
    if (isCanonicalOwner(path) && (canonicalRoute?.type !== "page" || canonicalRoute.id !== page.id)) continue;

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
    eventsIndexPath: canonicalEventsIndexPaths.length === 1
      ? canonicalEventsIndexPaths[0]
      : canonicalEventsIndexPaths.length === 0 && eventRoutes.filter(({ kind }) => kind === "index").length === 1
        ? eventRoutes.find(({ kind }) => kind === "index")?.path ?? null
        : null,
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

export const assertStaticRoutesEmitted = (
  routePlan: SiteRoutePlan,
  emittedPaths: readonly string[],
  indexable: boolean,
): void => {
  if (!indexable) return;

  const plannedPaths = [
    ...routePlan.cmsPages.map(({ path }) => path),
    ...routePlan.blueprintRoutes.map(({ path }) => path),
    ...routePlan.menuRoutes.map(({ path }) => path),
    ...routePlan.menuIndexPaths,
    ...routePlan.eventRoutes.map(({ path }) => path),
    ...routePlan.locationRoutes.map(({ path }) => path),
    ...routePlan.locationIndexPaths,
    ...routePlan.pressRoutes.map(({ path }) => path),
  ].map(normalizeRoutePath).filter((path) => path !== "/");
  // The homepage is emitted by the dedicated src/pages/index.astro route.
  const emitted = new Set(emittedPaths.map(normalizeRoutePath));
  const omitted = [...new Set(plannedPaths)].filter((path) => !emitted.has(path));

  if (omitted.length > 0) {
    throw new Error(`Indexable build omitted planned Backstage routes: ${omitted.join(", ")}.`);
  }
};
