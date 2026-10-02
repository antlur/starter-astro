import { getSiteContent, resolveBackstageRoute } from "../lib/backstage/content";
import { resolveBlueprintRoutes } from "./blueprint-routes";
import { applicationRoutePaths, buildSiteRoutePlan, reportUnhandledRoutes, resolveCanonicalPageRoutes } from "./routes";

let siteBuildPromise: ReturnType<typeof buildSite> | undefined;

const buildSite = async () => {
  const content = await getSiteContent();
  const initialPlan = buildSiteRoutePlan(content, applicationRoutePaths);
  const canResolveRoutes = import.meta.env.BACKSTAGE_SOURCE === "api" || import.meta.env.BACKSTAGE_SOURCE === "fixture";
  const routeCache = new Map<string, Promise<unknown>>();
  const cachedResolver = (path: string): Promise<unknown> => {
    let result = routeCache.get(path);
    if (!result) {
      result = resolveBackstageRoute(path);
      routeCache.set(path, result);
    }
    return result;
  };
  const resolvedPages = canResolveRoutes && initialPlan.unhandledPaths.length > 0
    ? await resolveCanonicalPageRoutes(initialPlan.unhandledPaths, content.pages, cachedResolver)
    : { pages: [], unhandledPaths: initialPlan.unhandledPaths };
  const routedContent = resolvedPages.pages.length > 0
    ? { ...content, pages: [...content.pages, ...resolvedPages.pages] }
    : content;
  const pageResolvedPlan = buildSiteRoutePlan(routedContent, applicationRoutePaths);
  const resolved = canResolveRoutes && pageResolvedPlan.unhandledPaths.length > 0
    ? await resolveBlueprintRoutes(pageResolvedPlan.unhandledPaths, cachedResolver)
    : { routes: [], unhandledPaths: pageResolvedPlan.unhandledPaths };
  const routePlan = buildSiteRoutePlan(routedContent, applicationRoutePaths, resolved.routes);

  reportUnhandledRoutes(routePlan.unhandledPaths, import.meta.env.SITE_INDEXABLE === "true");

  return { content, routePlan };
};

export const getSiteBuild = () => {
  siteBuildPromise ??= buildSite();
  return siteBuildPromise;
};
