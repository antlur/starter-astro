import type { SiteContent, SiteNavigationItem } from "../lib/backstage/content";
import { BACKSTAGE_REQUEST_CONCURRENCY, mapWithConcurrency } from "../lib/backstage/concurrency";
import { finalizeBlueprintRoutes, resolveBlueprintRoutes } from "./blueprint-routes";
import { addResolvedModuleContent, applicationRoutePaths, buildSiteRoutePlan, normalizeRoutePath, reportUnhandledRoutes, resolveCanonicalPageRoutes, type SiteRoutePlan } from "./routes";

let siteBuildPromise: ReturnType<typeof buildSite> | undefined;

export interface GeneratedRouteSeo {
  title: string | null;
  description: string | null;
  type: string | null;
  id: string | null;
}

type RouteResolver = (path: string) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalSeoText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const resolveGeneratedRouteSeo = async (
  paths: readonly string[],
  resolvedRoutes: ReadonlyMap<string, unknown>,
  resolver?: RouteResolver,
): Promise<Map<string, GeneratedRouteSeo>> => {
  const uniquePaths = [...new Set(paths)];
  const routeValues = new Map<string, unknown>();

  for (const path of uniquePaths) {
    if (resolvedRoutes.has(path)) routeValues.set(path, resolvedRoutes.get(path));
  }

  const missingPaths = uniquePaths.filter((path) => !routeValues.has(path));
  if (resolver && missingPaths.length > 0) {
    const fetchedRoutes = await mapWithConcurrency(missingPaths, BACKSTAGE_REQUEST_CONCURRENCY, async (path) =>
      [path, await resolver(path)] as const,
    );
    for (const [path, value] of fetchedRoutes) routeValues.set(path, value);
  }

  const results = uniquePaths.flatMap((path) => {
    if (!routeValues.has(path)) return [];

    const value = routeValues.get(path);
    if (!isRecord(value) || !isRecord(value.meta) || typeof value.meta.path !== "string") {
      throw new Error(`Backstage returned an invalid route response for ${path}.`);
    }

    if (normalizeRoutePath(value.meta.path) !== path) {
      throw new Error(`Backstage resolved ${path} to a different canonical route.`);
    }

    const seo = isRecord(value.meta.seo) ? value.meta.seo : {};
    const id = value.meta.id;
    return [[path, {
      title: optionalSeoText(seo.title),
      description: optionalSeoText(seo.description),
      type: optionalSeoText(value.meta.type),
      id: typeof id === "string" || typeof id === "number" ? String(id) : null,
    }] as const];
  });

  return new Map(results);
};

const navigationPath = (url: string): string | null => {
  if (!url.startsWith("/")) return null;
  return normalizeRoutePath(new URL(url, "https://backstage.invalid").pathname);
};

const flattenNavigation = (items: SiteNavigationItem[]): SiteNavigationItem[] =>
  items.flatMap((item) => [item, ...flattenNavigation(item.children)]);

const heuristicModuleCandidatePaths = (content: SiteContent): string[] => {
  const routePaths = [...new Set(content.routePaths.map(normalizeRoutePath))];
  const cmsPagePaths = new Set(content.pages.map((page) => normalizeRoutePath(page.pathname)));
  const candidates = new Set<string>();
  const routePathCounts = new Map<string, number>();
  for (const path of content.routePaths.map(normalizeRoutePath)) {
    routePathCounts.set(path, (routePathCounts.get(path) ?? 0) + 1);
  }
  const moduleSlugs = [
    ...content.events.map(({ slug }) => slug),
    ...content.menus.map(({ slug }) => slug),
    ...content.locations.map(({ slug }) => slug),
    ...content.pressReleases.map(({ slug }) => slug),
  ].filter((slug): slug is string => Boolean(slug));
  const moduleSlugSet = new Set(moduleSlugs);
  const moduleSlugCounts = new Map<string, number>();
  for (const slug of moduleSlugs) moduleSlugCounts.set(slug, (moduleSlugCounts.get(slug) ?? 0) + 1);
  const uniqueModuleSlug = (slug: string): boolean => moduleSlugCounts.get(slug) === 1;
  const eventSlugCounts = new Map<string, number>();
  for (const { slug } of content.events) {
    if (slug) eventSlugCounts.set(slug, (eventSlugCounts.get(slug) ?? 0) + 1);
  }

  for (const event of content.events) {
    if (event.slug && uniqueModuleSlug(event.slug)) candidates.add(normalizeRoutePath(`/events/${encodeURIComponent(event.slug)}`));
  }

  const routePathSet = new Set(routePaths);
  for (const path of routePaths) {
    const segments = path.split("/").filter(Boolean);
    const lastSegment = segments.at(-1);
    if (!lastSegment) continue;

    let slug: string;
    try {
      slug = decodeURIComponent(lastSegment);
    } catch {
      continue;
    }

    if (eventSlugCounts.get(slug) !== 1) continue;
    candidates.add(path);

    if (segments.length > 1) {
      const parentPath = normalizeRoutePath(`/${segments.slice(0, -1).join("/")}`);
      if (routePathSet.has(parentPath)) candidates.add(parentPath);
    }
  }

  for (const menu of content.menus) {
    if (menu.slug && uniqueModuleSlug(menu.slug)) candidates.add(normalizeRoutePath(`/menu/${encodeURIComponent(menu.slug)}`));
  }

  for (const release of content.pressReleases) {
    if (release.slug && uniqueModuleSlug(release.slug)) candidates.add(normalizeRoutePath(`/press/${encodeURIComponent(release.slug)}`));
  }
  candidates.add("/press/");
  candidates.add("/events/");

  const menuNavigationItems = flattenNavigation(content.navigation).filter((item) => item.menuId);
  if (menuNavigationItems.length > 0) candidates.add("/menu/");

  for (const location of content.locations) {
    if (!location.slug || !uniqueModuleSlug(location.slug)) continue;
    const slug = encodeURIComponent(location.slug);
    candidates.add(normalizeRoutePath(`/${slug}`));
    candidates.add(normalizeRoutePath(`/location/${slug}`));
    candidates.add(normalizeRoutePath(`/locations/${slug}`));
  }
  if (content.locations.length === 1) candidates.add("/location/");

  for (const path of routePaths) {
    const lastSegment = decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "");
    if (moduleSlugSet.has(lastSegment) && content.locations.some(({ slug }) => slug === lastSegment)) {
      const segments = path.split("/").filter(Boolean);
      if (segments.length === 1 || (segments.length === 2 && ["location", "locations"].includes(segments[0]))) {
        candidates.add(path);
      }
    }
    if (cmsPagePaths.has(path) && (moduleSlugSet.has(lastSegment) || (routePathCounts.get(path) ?? 0) > 1)) {
      candidates.add(path);
    }
  }

  for (const item of menuNavigationItems) {
    if (item.menuId) {
      const path = navigationPath(item.url);
      if (path) candidates.add(path);
    }
  }

  return routePaths.filter((path) => candidates.has(path));
};

export const buildSiteFromContent = async (
  content: SiteContent,
  resolver: (path: string) => Promise<unknown>,
  indexable = false,
) => {
  const routeCache = new Map<string, Promise<unknown>>();
  const cachedResolver = (path: string): Promise<unknown> => {
    let result = routeCache.get(path);
    if (!result) {
      result = resolver(path);
      routeCache.set(path, result);
    }
    return result;
  };

  // Resolve only public paths that overlap a route the starter would otherwise
  // claim heuristically. Ordinary static routes keep the existing flow.
  const moduleCandidatePaths = heuristicModuleCandidatePaths(content);
  const candidatePages = await resolveCanonicalPageRoutes(
    moduleCandidatePaths,
    content.pages,
    cachedResolver,
  );
  const candidateBlueprints = await resolveBlueprintRoutes(moduleCandidatePaths, cachedResolver);
  const preResolvedPaths = new Set(moduleCandidatePaths);
  const initialPlan = buildSiteRoutePlan(
    content,
    applicationRoutePaths,
    candidateBlueprints.routes,
    candidatePages.resolutions,
  );
  const unresolvedPaths = initialPlan.unhandledPaths.filter((path) => !preResolvedPaths.has(normalizeRoutePath(path)));
  const resolvedPages = unresolvedPaths.length > 0
    ? await resolveCanonicalPageRoutes(unresolvedPaths, content.pages, cachedResolver)
    : { pages: [], unhandledPaths: initialPlan.unhandledPaths, resolutions: [] };
  const routeResolutions = [...candidatePages.resolutions, ...resolvedPages.resolutions];
  const resolvedCmsPages = [...candidatePages.pages, ...resolvedPages.pages];
  const resolvedPagesById = new Map(resolvedCmsPages.map((page) => [page.id, page]));
  const contentPageIds = new Set(content.pages.map((page) => page.id));
  const pagesContent = resolvedCmsPages.length > 0
    ? {
        ...content,
        pages: [
          ...content.pages.map((page) => resolvedPagesById.get(page.id) ?? page),
          ...resolvedCmsPages.filter((page) => !contentPageIds.has(page.id)),
        ],
      }
    : content;
  const routedContent = addResolvedModuleContent(pagesContent, routeResolutions);
  const pageResolvedPlan = buildSiteRoutePlan(
    routedContent,
    applicationRoutePaths,
    candidateBlueprints.routes,
    routeResolutions,
  );
  const unresolvedBlueprintPaths = pageResolvedPlan.unhandledPaths.filter(
    (path) => !preResolvedPaths.has(normalizeRoutePath(path)),
  );
  const resolved = unresolvedBlueprintPaths.length > 0
    ? await resolveBlueprintRoutes(unresolvedBlueprintPaths, cachedResolver)
    : { routes: [], unhandledPaths: pageResolvedPlan.unhandledPaths };
  const blueprintRoutes = finalizeBlueprintRoutes([...candidateBlueprints.routes, ...resolved.routes]);
  const routePlan = buildSiteRoutePlan(
    routedContent,
    applicationRoutePaths,
    blueprintRoutes,
    routeResolutions,
  );

  reportUnhandledRoutes(routePlan.unhandledPaths, indexable);

  const resolvedRoutes = new Map(await Promise.all(
    [...routeCache].map(async ([path, result]) => [path, await result] as const),
  ));

  const finalized = applyFinalEventRoutes(routedContent, routePlan);
  return { ...finalized, resolvedRoutes };
};

const applyFinalEventRoutes = (content: SiteContent, routePlan: SiteRoutePlan) => {
  const publicPathsByEventId = new Map(routePlan.eventRoutes.flatMap((route) =>
    route.kind === "detail" ? [[route.event.id, route.path] as const] : [],
  ));
  const events = content.events.map((event) => ({
    ...event,
    publicPath: publicPathsByEventId.get(event.id) ?? null,
  }));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const pages = content.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => block.type === "upcoming-events"
      ? { ...block, events, eventsIndexPath: routePlan.eventsIndexPath }
      : block),
  }));
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const finalizedRoutePlan: SiteRoutePlan = {
    ...routePlan,
    cmsPages: routePlan.cmsPages.map((route) => ({ ...route, page: pagesById.get(route.page.id) ?? route.page })),
    eventRoutes: routePlan.eventRoutes.map((route) => route.kind === "detail"
      ? { ...route, event: eventsById.get(route.event.id) ?? { ...route.event, publicPath: route.path } }
      : route),
  };

  return { content: { ...content, events, pages }, routePlan: finalizedRoutePlan };
};

const buildSite = async () => {
  const { getSiteContent, resolveBackstageRoute } = await import("../lib/backstage/content");
  const content = await getSiteContent();
  const canResolveRoutes = import.meta.env.BACKSTAGE_SOURCE === "api" || import.meta.env.BACKSTAGE_SOURCE === "fixture";

  if (!canResolveRoutes) {
    const routePlan = buildSiteRoutePlan(content, applicationRoutePaths);
    reportUnhandledRoutes(routePlan.unhandledPaths, import.meta.env.SITE_INDEXABLE === "true");
    return { ...applyFinalEventRoutes(content, routePlan), resolvedRoutes: new Map<string, unknown>() };
  }

  return buildSiteFromContent(content, resolveBackstageRoute, import.meta.env.SITE_INDEXABLE === "true");
};

export const getSiteBuild = () => {
  siteBuildPromise ??= buildSite();
  return siteBuildPromise;
};
