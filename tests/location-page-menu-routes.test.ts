import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeMenu } from "../src/lib/backstage/menus";
import { menuRoutesForLocation } from "../src/site/menu-routes";
import { normalizeRoutePath } from "../src/site/routes";

const locationPageSource = new URL("../src/components/LocationPage.astro", import.meta.url);
const dynamicPageSource = new URL("../src/pages/[...slug].astro", import.meta.url);

test("location pages use actual location routes to scope menu links", async () => {
  const [source, dynamicPage] = await Promise.all([
    readFile(locationPageSource, "utf8"),
    readFile(dynamicPageSource, "utf8"),
  ]);

  assert.match(source, /menuRoutesForLocation\(menuRoutes, routePath/);
  assert.match(source, /locationRoutes:\s*SiteLocationRoute\[\]/);
  assert.match(source, /otherLocationPaths:\s*locationRoutes\s*\.filter\(\(\{ location: candidate \}\) => candidate\.id !== location\.id\)/);
  assert.match(source, /location\.menuIds\?\.length\s*\?\s*menuRoutesForLocation/);
  assert.match(dynamicPage, /<LocationPage[^>]*locationRoutes=\{locationRoutes(?: \?\? \[\])?\}/);
  assert.doesNotMatch(source, /uniqueMenuRoutes/);
});

test("location page keeps a root canonical menu route and hides another location's alias", () => {
  const dinner = normalizeMenu({ id: "dinner", title: "Dinner", slug: "dinner", categories: [] });
  const north = { id: "north", menuIds: [dinner.id] };
  const south = { id: "south", menuIds: [dinner.id] };
  const locationRoutes = [
    { path: "/locations/north/", location: north },
    { path: "/locations/south/", location: south },
  ];
  const routes = [
    { path: "/menu/dinner/", label: "Dinner", menu: dinner },
    { path: "/locations/north/menu/dinner/", label: "Dinner", menu: dinner },
  ];
  const locationPath = "/locations/south/";
  const currentLocation = south;
  const visible = menuRoutesForLocation(routes, locationPath, {
    path: normalizeRoutePath(locationPath),
    menuIds: currentLocation.menuIds,
    otherLocationPaths: locationRoutes
      .filter(({ location }) => location.id !== currentLocation.id)
      .map(({ path }) => path),
  });

  assert.deepEqual(visible.map(({ path }) => path), ["/menu/dinner/"]);
});

test("location route ownership respects segment boundaries", () => {
  const dinner = normalizeMenu({ id: "dinner", title: "Dinner", slug: "dinner", categories: [] });
  const north = { id: "north", menuIds: [dinner.id] };
  const northwest = { id: "northwest", menuIds: [dinner.id] };
  const locationRoutes = [
    { path: "/locations/north/", location: north },
    { path: "/locations/northwest/", location: northwest },
  ];
  const routes = [
    { path: "/menu/dinner/", label: "Dinner", menu: dinner },
    { path: "/locations/northwest/menu/dinner/", label: "Dinner", menu: dinner },
  ];
  const visible = menuRoutesForLocation(routes, "/locations/north/", {
    path: "/locations/north/",
    menuIds: north.menuIds,
    otherLocationPaths: locationRoutes
      .filter(({ location }) => location.id !== north.id)
      .map(({ path }) => path),
  });

  assert.deepEqual(visible.map(({ path }) => path), ["/menu/dinner/"]);
});

test("location page omits ambiguous menu assignments", () => {
  const shared = normalizeMenu({ id: "shared", title: "All Day", slug: "all-day", categories: [] });
  const southDinner = normalizeMenu({ id: "south-dinner", title: "Dinner", slug: "dinner", categories: [] });
  const routes = [
    { path: "/locations/north/menu/all-day/", label: "All Day", menu: shared },
    { path: "/locations/south/menu/all-day/", label: "All Day", menu: shared },
    { path: "/menu/all-day/", label: "All Day", menu: shared },
    { path: "/locations/south/menu/dinner/", label: "Dinner", menu: southDinner },
  ];
  const unassociated = menuRoutesForLocation(routes, "/locations/south/", {
    path: "/locations/south/",
    menuIds: null,
    otherLocationPaths: routes.map(({ path }) => path),
    ambiguous: true,
  });
  assert.deepEqual(unassociated, []);
});
