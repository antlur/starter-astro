import { locationServiceLinks, locationServices } from "../../site/location-choices";
import { locationRouteForPath, menusForLocation } from "../../site/menu-routes";
import { normalizeRoutePath, type SiteRoutePlan } from "../../site/routes";
import { safeLinkUrl } from "../safe-url";
import { sanitizeRichText } from "../sanitize-rich-text";
import type { HeadlessBlock, SiteContent, SiteNavigationItem } from "./content";
import { isPublicLocation, type LocationService } from "./locations";

const flattenNavigation = (items: readonly SiteNavigationItem[]): SiteNavigationItem[] =>
  items.flatMap((item) => [item, ...flattenNavigation(item.children)]).filter(({ text }) => text.trim());

const sitePath = (url: string, domain: URL | null): string | null => {
  const safeUrl = safeLinkUrl(url);
  if (!safeUrl || safeUrl.startsWith("#")) return null;
  const target = new URL(safeUrl, "https://starter.invalid");
  if (!safeUrl.startsWith("/") && (!/^https?:$/.test(target.protocol) || target.host !== domain?.host)) return null;
  return target.pathname.startsWith("//") ? null : normalizeRoutePath(target.pathname);
};

const hasFormSelection = (block: HeadlessBlock): boolean => block.type === "contact-form"
  && ((typeof block.fields.form_id === "string" && block.fields.form_id.trim() !== "")
    || Boolean(block.form?.fields.length));

const hasContactLink = (url: string | null | undefined): boolean => {
  const link = URL.parse(url ?? "");
  return link?.protocol === "tel:" ? /\d/.test(link.pathname)
    : link?.protocol === "mailto:" && link.pathname.includes("@");
};

export const inspectRestaurantLaunch = (content: SiteContent, routePlan: SiteRoutePlan): {
  details: string[];
  blockers: string[];
  warnings: string[];
} => {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { site } = content;
  const branches = content.locations.filter(isPublicLocation);
  const publicIds = new Set(branches.map(({ id }) => id));
  const locationRoutes = routePlan.locationRoutes.filter(({ location }) =>
    isPublicLocation(location) && publicIds.has(location.id));
  const menus = routePlan.menuRoutes.filter(({ menu, locationId }) =>
    menu.isPublished !== false && (!locationId || publicIds.has(locationId)));
  const services = (Object.keys(locationServices) as LocationService[]).map((service) =>
    `${service}: ${branches.filter((branch) => locationServiceLinks(branch, service).length > 0).length}/${branches.length}`);
  const details = [
    `Public branches: ${branches.length}`,
    `Public routable menus: ${new Set(menus.map(({ menu }) => menu.id)).size} (${menus.length} routes)`,
    `Location service availability (public branches with provider links): ${services.join(", ")}`,
  ];

  if (branches.length === 0) blockers.push("Publish at least one restaurant location in Backstage.");
  if (menus.length === 0) blockers.push("Publish at least one menu with a public route in Backstage.");
  if (routePlan.unhandledPaths.length > 0) {
    blockers.push(`Resolve public routes not rendered by the Starter: ${routePlan.unhandledPaths.join(", ")}.`);
  }

  const domain = site.domain ? URL.parse(site.domain.includes("://") ? site.domain : `https://${site.domain}`) : null;
  const navigation = flattenNavigation(routePlan.navigation);
  const primaryPaths = new Set(navigation.map(({ url }) => sitePath(url, domain)));
  const pages = new Map(routePlan.cmsPages.map(({ path, page }) => [path, page]));

  if (branches.length > 1) {
    for (const branch of branches) {
      const routes = locationRoutes.filter(({ location }) => location.id === branch.id);
      const route = routes[0];
      if (!route || routes.length !== 1 || locationRoutes.filter(({ path }) => path === route.path).length !== 1) {
        blockers.push(`Give ${branch.name} exactly one unique public location route in Backstage.`);
      }
      if (route && !routes.some((candidate) => menusForLocation(candidate, menus, locationRoutes).length > 0)) {
        blockers.push(`Publish at least one routable menu for ${branch.name} in Backstage.`);
      }
    }

    const directories = routePlan.locationIndexPaths;
    if (directories.length === 0) blockers.push("Publish a canonical Locations directory in Backstage.");
    else if (!directories.some((path) => primaryPaths.has(path))) {
      blockers.push(`Link the canonical Locations directory (${directories.join(", ")}) in the primary navigation.`);
    }

    // A generated chooser is explicit in the plan. A custom Menu destination must be intentional, not a guessed alias.
    const menuEntryPaths = new Set(["/menu/", ...navigation.flatMap(({ text, url }) => {
      const path = /^menus?$/i.test(text.trim()) ? sitePath(url, domain) : null;
      return path ? [path] : [];
    })]);
    const chooserPaths = routePlan.locationChooserRoutes.filter(({ purpose }) => purpose === "menu").map(({ path }) => path);
    const menuEntries = new Set([
      ...chooserPaths,
      ...[...menuEntryPaths].filter((path) => pages.has(path) || (chooserPaths.length === 0 && menus.some((menu) =>
        menu.path === path && !menu.locationId && !locationRouteForPath(path, locationRoutes)))),
    ]);
    if (menuEntries.size > 0) {
      details.push(`Menu entry: ${[...menuEntries].join(", ")}`);
      if (![...menuEntries].some((path) => primaryPaths.has(path))) {
        blockers.push(`Link the Menu entry (${[...menuEntries].join(", ")}) in the primary navigation.`);
      }
    } else {
      blockers.push("Provide a Menu entry that lets visitors choose a branch or uses an intentional Backstage Menu page.");
    }
  }

  const home = pages.get("/");
  if (home?.is_home) {
    details.push("Home page: /");
    if (home.blocks.length === 0 && !home.layout) {
      blockers.push("Add restaurant content to the existing Home page in the Backstage editor.");
    }
  }
  if (!pages.has("/about/")) blockers.push("Create a public About page at /about/.");
  const contact = pages.get("/contact/");
  if (!contact) blockers.push("Create a public Contact page at /contact/.");

  if (!contact?.blocks.some(hasFormSelection)) {
    const contactFallback = (branches.length === 1 && /\d/.test(branches[0].phone ?? ""))
      || locationRoutes.some(({ location }) => /\d/.test(location.phone ?? "") || location.email?.includes("@"))
      || [...navigation, ...flattenNavigation(routePlan.footerNavigation)].some(({ url }) => hasContactLink(url))
      || hasContactLink(site.homeCta?.url)
      || contact?.blocks.some(({ fields }) => typeof fields.body === "string"
        && [...sanitizeRichText(fields.body).matchAll(/<a href="([^"]+)"/g)].some(([, url]) => hasContactLink(url)))
      || [...pages.values()].some((page) => page.blocks.some(hasFormSelection));
    if (contactFallback) warnings.push("No Contact Form is configured at /contact/; a public contact fallback is available.");
    else blockers.push("No public contact channel was found. Configure a Contact Form at /contact/ or publish a phone or email link.");
  }

  if (!site.name.trim() || site.name === "Website") warnings.push("Set a restaurant site name in Backstage instead of the generic Website label.");
  if (!site.logo?.url.trim()) warnings.push("No website logo is configured; the header and footer will show the site name.");

  return { details, blockers, warnings };
};
