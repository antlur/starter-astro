import assert from "node:assert/strict";
import test from "node:test";
import { multiLocationRouteResolutions, multiLocationSiteContent } from "../src/fixtures/multi-location";
import type { HeadlessBlock, HeadlessPage, SiteContent, SiteNavigationItem } from "../src/lib/backstage/content";
import { inspectRestaurantLaunch } from "../src/lib/backstage/restaurant-readiness";
import { buildSiteRoutePlan } from "../src/site/routes";

const cmsPage = (slug: string, blocks: HeadlessBlock[] = []): HeadlessPage => ({
  ...multiLocationSiteContent.pages[0],
  id: slug,
  title: slug,
  pathname: `/${slug}/`,
  slug,
  is_home: false,
  blocks,
});
const form = { id: "contact-form", type: "contact-form", fields: { form_id: "selected-form" } };
const fixture: SiteContent = {
  ...multiLocationSiteContent,
  site: { ...multiLocationSiteContent.site, logo: { url: "/logo.svg" }, themeVariables: undefined },
  pages: [...multiLocationSiteContent.pages.filter(({ is_home }) => is_home), cmsPage("about"), cmsPage("contact", [form])],
  routePaths: [...new Set([...multiLocationSiteContent.routePaths, "/about/", "/contact/"])],
};
const resolutions = Object.entries(multiLocationRouteResolutions).map(([path, value]) => ({ path, value }));
const plan = buildSiteRoutePlan(fixture, [], [], resolutions);
const link = (text: string, url: string, children: SiteNavigationItem[] = []): SiteNavigationItem =>
  ({ id: text, text, url, newWindow: false, children });

test("counts public branches, unique routable menus, and branches offering each service", () => {
  assert.deepEqual(inspectRestaurantLaunch(fixture, plan), {
    details: [
      "Public branches: 5",
      "Public routable menus: 3 (7 routes)",
      "Location service availability (public branches with provider links): ordering: 2/5, delivery: 0/5, reservation: 2/5, waitlist: 2/5",
      "Menu entry: /menu/",
      "Home page: /",
    ],
    blockers: [],
    warnings: [],
  });
});

test("requires one public route per branch and a published, correctly scoped menu on routable branches", () => {
  const [, market, river, north, west, south] = fixture.locations;
  const northRoute = plan.locationRoutes.find(({ location }) => location.id === north.id)!;
  const result = inspectRestaurantLaunch(fixture, {
    ...plan,
    locationRoutes: [
      ...plan.locationRoutes.filter(({ location }) => location.id !== south.id),
      { path: "/other-north-loop/", location: north },
      { path: northRoute.path, location: west },
      { path: "/private/", location: fixture.locations[0] },
    ],
    menuRoutes: plan.menuRoutes.map((entry) => entry.locationId === market.id
      ? { ...entry, menu: { ...entry.menu, isPublished: false } }
      : entry.locationId === river.id ? { ...entry, locationId: north.id } : entry),
  });

  assert.match(result.blockers.join("\n"), /South Lawn.*unique public location route/);
  assert.match(result.blockers.join("\n"), /North Loop.*unique public location route/);
  assert.match(result.blockers.join("\n"), /West End.*unique public location route/);
  assert.match(result.blockers.join("\n"), /routable menu for Market Street/);
  assert.match(result.blockers.join("\n"), /routable menu for Riverfront/);
  assert.doesNotMatch(result.blockers.join("\n"), /Private Test Kitchen|routable menu for South Lawn/);
});

test("uses the canonical directory in the rendered primary nav, not a CMS substitute or footer link", () => {
  const custom = { ...plan, locationIndexPaths: ["/visit/"] };
  const content = { ...fixture, site: { ...fixture.site, domain: "restaurant.example" } };
  const nested = link("Plan a visit", "/", [link("Locations", "https://restaurant.example/visit?ref=header#branches")]);
  assert.deepEqual(inspectRestaurantLaunch(content, { ...custom, navigation: [nested, link("Menu", "/menu/")] }).blockers, []);

  const footerOnly = {
    ...custom,
    navigation: [link("Locations", "https://other.example/visit/")],
    footerNavigation: [link("Locations", "/visit/")],
  };
  assert.match(inspectRestaurantLaunch(content, footerOnly).blockers.join("\n"), /Locations directory \(\/visit\/\).*primary navigation/);
  assert.match(inspectRestaurantLaunch(content, { ...footerOnly, locationIndexPaths: [] }).blockers.join("\n"), /Publish a canonical Locations directory/);
});

test("accepts the plan's Menu chooser or intentional CMS Menu but does not infer an entry from a path claim", () => {
  const chooser = { ...plan, locationChooserRoutes: [{ path: "/choose-a-menu/", purpose: "menu" as const }] };
  assert.ok(inspectRestaurantLaunch(fixture, chooser).details.includes("Menu entry: /choose-a-menu/"));
  assert.match(inspectRestaurantLaunch(fixture, chooser).blockers.join("\n"), /Link the Menu entry.*primary navigation/);

  const cmsMenu = cmsPage("our-food");
  const cmsContent = {
    ...fixture,
    pages: [...fixture.pages, cmsMenu],
    routePaths: [...fixture.routePaths.filter((path) => path !== "/menu/"), cmsMenu.pathname],
    navigation: [link("Menu", cmsMenu.pathname), link("Locations", "/locations/")],
  };
  const cmsPlan = buildSiteRoutePlan(cmsContent, ["/menu/"], [], resolutions);
  assert.deepEqual(inspectRestaurantLaunch(cmsContent, cmsPlan).blockers, []);
  assert.ok(inspectRestaurantLaunch(cmsContent, cmsPlan).details.includes("Menu entry: /our-food/"));
  assert.match(inspectRestaurantLaunch(cmsContent, { ...cmsPlan, navigation: [link("Locations", "/locations/")] })
    .blockers.join("\n"), /Provide a Menu entry/);

  const [menu] = fixture.menus;
  const brandMenuPlan = buildSiteRoutePlan(fixture, [], [], [...resolutions, {
    path: "/menu/",
    value: { type: "menu", data: menu, meta: { type: "menu", id: menu.id, path: "/menu/", location: null } },
  }]);
  assert.deepEqual(brandMenuPlan.locationChooserRoutes.filter(({ purpose }) => purpose === "menu"), []);
  assert.deepEqual(inspectRestaurantLaunch(fixture, brandMenuPlan).blockers, []);
});

test("allows a single branch without a directory, chooser, or service providers", () => {
  const single = { ...fixture, locations: [{ ...fixture.locations[1], providerLinks: {} }] };
  const singlePlan = {
    ...plan,
    locationRoutes: [],
    locationIndexPaths: [],
    locationChooserRoutes: [],
  };
  const ready = inspectRestaurantLaunch(single, singlePlan);
  assert.deepEqual(ready.blockers, []);
  assert.deepEqual(ready.warnings, []);
  assert.match(ready.details[2], /ordering: 0\/1, delivery: 0\/1, reservation: 0\/1, waitlist: 0\/1/);
  assert.match(inspectRestaurantLaunch(single, { ...singlePlan, menuRoutes: [] }).blockers.join("\n"), /Publish at least one menu/);
  assert.match(inspectRestaurantLaunch({ ...single, locations: [fixture.locations[0]] }, singlePlan).blockers.join("\n"), /Publish at least one restaurant location/);
});

test("warns about the generic brand and missing logo, not the absence of remote design tokens", () => {
  assert.deepEqual(inspectRestaurantLaunch({ ...fixture, site: { ...fixture.site, name: "Website", logo: null } }, plan).warnings, [
    "Set a restaurant site name in Backstage instead of the generic Website label.",
    "No website logo is configured; the header and footer will show the site name.",
  ]);
});

test("blocks an empty account-default Home and unhandled public routes", () => {
  const result = inspectRestaurantLaunch(fixture, {
    ...plan,
    cmsPages: plan.cmsPages.map((entry) => entry.page.is_home
      ? { ...entry, page: { ...entry.page, blocks: [], layout: null } } : entry),
    unhandledPaths: ["/unrendered/"],
  });
  assert.deepEqual(result.blockers, [
    "Resolve public routes not rendered by the Starter: /unrendered/.",
    "Add restaurant content to the existing Home page in the Backstage editor.",
  ]);
});

test("distinguishes configured Contact Forms, public fallbacks, and missing contact channels", () => {
  const noForm = { ...plan, cmsPages: plan.cmsPages.filter(({ path }) => path !== "/contact/") };
  const fallback = inspectRestaurantLaunch(fixture, noForm);
  assert.deepEqual(fallback.blockers, ["Create a public Contact page at /contact/."]);
  assert.deepEqual(fallback.warnings, [
    "No Contact Form is configured at /contact/; a public contact fallback is available.",
  ]);

  const unreachable = {
    ...noForm,
    locationRoutes: plan.locationRoutes.map((entry) => ({ ...entry, location: { ...entry.location, phone: null } })),
    cmsPages: [...noForm.cmsPages, { path: "/contact/", page: cmsPage("contact", [{ ...form, fields: { form_id: " " } }]) }],
  };
  assert.deepEqual(inspectRestaurantLaunch(fixture, unreachable).blockers, [
    "No public contact channel was found. Configure a Contact Form at /contact/ or publish a phone or email link.",
  ]);

  const contactLink = { id: "reach-us", type: "rich-text", fields: { body: '<p><a href="mailto:hello@example.test">Email us</a></p>' } };
  const emailFallback = { ...unreachable, cmsPages: [...noForm.cmsPages, { path: "/contact/", page: cmsPage("contact", [contactLink]) }] };
  assert.deepEqual(inspectRestaurantLaunch(fixture, emailFallback).blockers, []);
  assert.match(inspectRestaurantLaunch(fixture, emailFallback).warnings.join("\n"), /public contact fallback is available/);
});
