import { getHomePage, getPageBySlug, type HeadlessPage, type SiteContent } from "../lib/backstage/content";

export interface SiteRoute {
  path: string;
  pageSlug: string | null;
  label?: string;
}

export const siteRoutes = [
  { path: "/", pageSlug: null, label: "Home" },
  { path: "/about/", pageSlug: "about", label: "About" },
] as const satisfies readonly SiteRoute[];

const routePaths = new Set<string>();

for (const route of siteRoutes) {
  if (
    !route.path.startsWith("/")
    || route.path.startsWith("//")
    || (route.path !== "/" && !route.path.endsWith("/"))
    || route.path.includes("?")
    || route.path.includes("#")
  ) {
    throw new Error("Site routes must be absolute paths with a trailing slash: " + route.path);
  }

  if (routePaths.has(route.path)) {
    throw new Error("Duplicate site route: " + route.path);
  }

  routePaths.add(route.path);
}

if (!routePaths.has("/")) {
  throw new Error("The app-owned route map must include the homepage at /.");
}

export const getPageForRoute = (content: SiteContent, route: SiteRoute): HeadlessPage =>
  route.pageSlug === null ? getHomePage(content.pages) : getPageBySlug(content.pages, route.pageSlug);

export const siteNavigation = siteRoutes.flatMap((route) =>
  route.label ? [{ label: route.label, href: route.path }] : []
);
