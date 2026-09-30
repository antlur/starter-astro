import type { HeadlessPage, SiteContent, SiteNavigationItem } from "../lib/backstage/content";
import type { BlueprintRoute } from "./blueprint-routes";

export interface CmsPageRoute {
  path: string;
  page: HeadlessPage;
}

export interface SiteRoutePlan {
  cmsPages: CmsPageRoute[];
  blueprintRoutes: BlueprintRoute[];
  applicationPaths: string[];
  unhandledPaths: string[];
  navigation: SiteNavigationItem[];
}

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

export const buildSiteRoutePlan = (
  content: SiteContent,
  applicationPaths: readonly string[] = applicationRoutePaths,
  blueprintRoutes: readonly BlueprintRoute[] = [],
): SiteRoutePlan => {
  const routePaths = normalizeUniquePaths(content.routePaths, "Backstage site graph");
  const appPaths = normalizeUniquePaths(applicationPaths, "Application routes");
  const appPathSet = new Set(appPaths);
  const blueprintPaths = normalizeUniquePaths(blueprintRoutes.map(({ path }) => path), "Resolved Backstage blueprint routes");
  const blueprintPathSet = new Set(blueprintPaths);
  const pagesByPath = new Map<string, HeadlessPage>();

  for (const path of blueprintPaths) {
    if (!routePaths.includes(path)) {
      throw new Error(`Resolved Backstage blueprint route ${path} is not in the public site graph.`);
    }
    if (appPathSet.has(path)) {
      throw new Error(`Application route ${path} collides with a Backstage blueprint route.`);
    }
  }

  for (const page of content.pages) {
    const path = normalizeRoutePath(page.pathname);

    if (pagesByPath.has(path)) {
      throw new Error(`Multiple Backstage pages resolve to ${path}.`);
    }

    if (appPathSet.has(path)) {
      throw new Error(`Application route ${path} collides with a Backstage CMS page.`);
    }
    if (blueprintPathSet.has(path)) {
      throw new Error(`Backstage blueprint route ${path} collides with a Backstage CMS page.`);
    }

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
    unhandledPaths,
    navigation: filterNavigation(content.navigation, availablePaths),
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
