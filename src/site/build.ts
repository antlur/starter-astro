import { getSiteContent, resolveBackstageRoute } from "../lib/backstage/content";
import { resolveBlueprintRoutes } from "./blueprint-routes";
import { applicationRoutePaths, buildSiteRoutePlan, reportUnhandledRoutes } from "./routes";

let siteBuildPromise: ReturnType<typeof buildSite> | undefined;

const buildSite = async () => {
  const content = await getSiteContent();
  const initialPlan = buildSiteRoutePlan(content, applicationRoutePaths);
  const canResolveRoutes = import.meta.env.BACKSTAGE_SOURCE === "api" || import.meta.env.BACKSTAGE_SOURCE === "fixture";
  const resolved = canResolveRoutes && initialPlan.unhandledPaths.length > 0
    ? await resolveBlueprintRoutes(initialPlan.unhandledPaths, resolveBackstageRoute)
    : { routes: [], unhandledPaths: initialPlan.unhandledPaths };
  const routePlan = buildSiteRoutePlan(content, applicationRoutePaths, resolved.routes);

  reportUnhandledRoutes(routePlan.unhandledPaths, import.meta.env.SITE_INDEXABLE === "true");

  return { content, routePlan };
};

export const getSiteBuild = () => {
  siteBuildPromise ??= buildSite();
  return siteBuildPromise;
};
