import assert from "node:assert/strict";
import test from "node:test";
import { multiLocationRouteResolutions, multiLocationSiteContent } from "../src/fixtures/multi-location";
import { buildSiteFromContent } from "../src/site/build";
import { buildSiteRoutePlan } from "../src/site/routes";
import { menuLocationScopeForRoute, menusForLocation } from "../src/site/menu-routes";

const resolutions = Object.entries(multiLocationRouteResolutions).map(([path, value]) => ({ path, value }));
const content = multiLocationSiteContent;

test("offers only routable restaurant choosers and ignores a private branch", () => {
  const plan = buildSiteRoutePlan(content, [], [], resolutions);
  assert.deepEqual(plan.locationChooserRoutes.map(({ path }) => path), ["/menu/", "/order-online/", "/reservations/", "/waitlist/"]);
  assert.ok(!plan.locationRoutes.some(({ path }) => path.includes("test-kitchen")));
  assert.ok(plan.navigation.some(({ url }) => url === "/order-online/"));
});

test("leaves CMS and application ownership in place", () => {
  const orderPage = { ...content.pages[0], id: "custom-order", pathname: "/order-online/", is_home: false };
  const plan = buildSiteRoutePlan({ ...content, pages: [...content.pages, orderPage], routePaths: [...content.routePaths, orderPage.pathname] }, ["/reservations/"], [], resolutions);
  assert.ok(!plan.locationChooserRoutes.some(({ path }) => ["/order-online/", "/reservations/"].includes(path)));
  assert.ok(plan.cmsPages.some(({ page }) => page.id === "custom-order"));
  assert.ok(plan.applicationPaths.includes("/reservations/"));
});

test("does not replace an explicit canonical brand menu with a branch chooser", async () => {
  const [menu] = content.menus;
  const resolver = async (path: string) => path === "/menu/"
    ? { type: "menu", data: menu, meta: { type: "menu", id: menu.id, path, location: null } }
    : multiLocationRouteResolutions[path] ?? { type: "fixture", data: null, meta: { type: "fixture", id: null, path } };
  const { routePlan } = await buildSiteFromContent(content, resolver, true);
  assert.ok(!routePlan.locationChooserRoutes.some(({ purpose }) => purpose === "menu"));
  assert.ok(routePlan.menuRoutes.some(({ path }) => path === "/menu/"));
});

test("replaces the generated unscoped root with a branch chooser in the restaurant profile", () => {
  const [menu] = content.menus;
  const canonicalMenu = { path: "/menu/", value: { type: "menu", data: menu, meta: { type: "menu", id: menu.id, path: "/menu/", location: null } } };
  const plan = buildSiteRoutePlan(content, [], [], [...resolutions, canonicalMenu], true);
  assert.ok(!plan.menuRoutes.some(({ path }) => path === "/menu/"));
  assert.ok(plan.menuRoutes.some(({ path }) => path.startsWith("/locations/riverfront/menu/")));
  assert.deepEqual(plan.locationChooserRoutes.filter(({ purpose }) => purpose === "menu").map(({ path }) => path),
    ["/menu/", "/menus-by-location/"]);
  const reserved = buildSiteRoutePlan(content, ["/menus-by-location/"], [], [...resolutions, canonicalMenu], true);
  assert.deepEqual(reserved.locationChooserRoutes.filter(({ purpose }) => purpose === "menu").map(({ path }) => path), ["/menu/"]);
});

test("preserves a restaurant root menu explicitly chosen in navigation", () => {
  const [menu] = content.menus;
  const canonicalMenu = { path: "/menu/", value: { type: "menu", data: menu, meta: { type: "menu", id: menu.id, path: "/menu/", location: null } } };
  const navigation = [{ id: "root-menu", text: "Menu", url: "/menu/", newWindow: false, menuId: menu.id, children: [] }];
  const plan = buildSiteRoutePlan({ ...content, navigation }, [], [], [...resolutions, canonicalMenu], true);
  assert.ok(plan.menuRoutes.some(({ path }) => path === "/menu/"));
  assert.deepEqual(plan.locationChooserRoutes.filter(({ purpose }) => purpose === "menu").map(({ path }) => path), ["/menus-by-location/"]);
});

test("preserves a location-owned root alias in the restaurant profile", () => {
  const [menu] = content.menus;
  const [location] = content.locations;
  const scopedMenu = { path: "/menu/", value: { type: "menu", data: menu, meta: { type: "menu", id: menu.id, path: "/menu/", location: { id: location.id } } } };
  const plan = buildSiteRoutePlan(content, [], [], [...resolutions, scopedMenu], true);
  assert.ok(plan.menuRoutes.some(({ path, locationId }) => path === "/menu/" && locationId === location.id));
  assert.ok(!plan.locationChooserRoutes.some(({ path }) => path === "/menu/"));
});

test("uses explicit location ownership for shared menu aliases outside location prefixes", () => {
  const plan = buildSiteRoutePlan(content, [], [], resolutions);
  const market = plan.locationRoutes.find(({ path }) => path === "/locations/market-street/")!;
  const river = plan.locationRoutes.find(({ path }) => path === "/locations/riverfront/")!;
  const [menu] = content.menus;
  const aliases = [
    { menu, label: "River All Day", path: "/other-river-menu/", locationId: river.location.id },
    { menu, label: "Market All Day", path: "/other-market-menu/", locationId: market.location.id },
  ];
  assert.deepEqual(menusForLocation(market, aliases, plan.locationRoutes).map(({ label }) => label), ["Market All Day"]);
  assert.equal(menuLocationScopeForRoute(aliases[0].path, menu.id, content.locations, plan.locationRoutes, aliases[0].locationId)?.locationId, river.location.id);
  assert.equal(menuLocationScopeForRoute(aliases[0].path, menu.id, [river.location], plan.locationRoutes, "no-public-route")?.ambiguous, true);
});
