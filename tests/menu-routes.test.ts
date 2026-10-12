import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMenu } from "../src/lib/backstage/menus";
import { menuLocationScopeForRoute, menuRoutesForLocation, uniqueMenuRoutes } from "../src/site/menu-routes";

test("shows one link per menu and keeps the current alias selected", () => {
  const firstMenu = normalizeMenu({ id: "menu-1", title: "All Day", slug: "all-day", categories: [] });
  const secondMenu = normalizeMenu({ id: "menu-2", title: "Dinner", slug: "dinner", categories: [] });
  const routes = [
    { path: "/menu/", label: "Menu", menu: firstMenu },
    { path: "/menu/all-day/", label: "All Day", menu: firstMenu },
    { path: "/menu/dinner/", label: "Dinner", menu: secondMenu },
  ];

  assert.deepEqual(uniqueMenuRoutes(routes).map(({ path }) => path), ["/menu/", "/menu/dinner/"]);
  assert.deepEqual(uniqueMenuRoutes(routes, "/menu/all-day/").map(({ path }) => path), [
    "/menu/all-day/",
    "/menu/dinner/",
  ]);
});

test("keeps shared menu order stable when the current route is a later alias", () => {
  const firstMenu = normalizeMenu({ id: "menu-1", title: "All Day", slug: "all-day", categories: [] });
  const secondMenu = normalizeMenu({ id: "menu-2", title: "Dinner", slug: "dinner", categories: [] });
  const routes = [
    { path: "/menus/early/", label: "Early", menu: firstMenu },
    { path: "/menus/dinner/", label: "Dinner", menu: secondMenu },
    { path: "/menus/late/", label: "Late", menu: firstMenu },
  ];

  assert.deepEqual(uniqueMenuRoutes(routes).map(({ path }) => path), [
    "/menus/early/",
    "/menus/dinner/",
  ]);
  assert.deepEqual(uniqueMenuRoutes(routes, "/menus/late/").map(({ path }) => path), [
    "/menus/late/",
    "/menus/dinner/",
  ]);
});

test("scopes nested menu selectors to the location path and its assigned menus", () => {
  const shared = normalizeMenu({ id: "shared", title: "All Day", slug: "all-day", categories: [] });
  const northLunch = normalizeMenu({ id: "north-lunch", title: "Lunch", slug: "lunch", categories: [] });
  const southDinner = normalizeMenu({ id: "south-dinner", title: "Dinner", slug: "dinner", categories: [] });
  const locations = [
    { id: "north", menuIds: [shared.id, northLunch.id] },
    { id: "south", menuIds: [shared.id, southDinner.id] },
  ];
  const locationRoutes = [
    { path: "/locations/north/", location: locations[0] },
    { path: "/locations/south/", location: locations[1] },
  ];
  const routes = [
    { path: "/locations/north/menu/all-day/", label: "All Day", menu: shared },
    { path: "/locations/south/menu/all-day/", label: "All Day", menu: shared },
    { path: "/locations/north/menu/lunch/", label: "Lunch", menu: northLunch },
    { path: "/locations/south/menu/dinner/", label: "Dinner", menu: southDinner },
  ];
  const currentPath = "/locations/north/menu/all-day/";
  const scope = menuLocationScopeForRoute(currentPath, shared.id, locations, locationRoutes);

  assert.deepEqual(menuRoutesForLocation(routes, currentPath, scope).map(({ path }) => path), [
    currentPath,
    "/locations/north/menu/lunch/",
  ]);
});

test("omits cross-location menu choices for an ambiguous root menu route", () => {
  const shared = normalizeMenu({ id: "shared", title: "All Day", slug: "all-day", categories: [] });
  const northLunch = normalizeMenu({ id: "north-lunch", title: "Lunch", slug: "lunch", categories: [] });
  const southDinner = normalizeMenu({ id: "south-dinner", title: "Dinner", slug: "dinner", categories: [] });
  const locations = [
    { id: "north", menuIds: [shared.id, northLunch.id] },
    { id: "south", menuIds: [shared.id, southDinner.id] },
  ];
  const locationRoutes = [
    { path: "/locations/north/", location: locations[0] },
    { path: "/locations/south/", location: locations[1] },
  ];
  const routes = [
    { path: "/menu/all-day/", label: "All Day", menu: shared },
    { path: "/locations/north/menu/lunch/", label: "Lunch", menu: northLunch },
    { path: "/locations/south/menu/dinner/", label: "Dinner", menu: southDinner },
  ];
  const currentPath = "/menu/all-day/";
  const scope = menuLocationScopeForRoute(currentPath, shared.id, locations, locationRoutes);

  assert.deepEqual(menuRoutesForLocation(routes, currentPath, scope).map(({ path }) => path), [currentPath]);
});

test("allows root-level menu switching when the current menu belongs to one location", () => {
  const lunch = normalizeMenu({ id: "lunch", title: "Lunch", slug: "lunch", categories: [] });
  const dinner = normalizeMenu({ id: "dinner", title: "Dinner", slug: "dinner", categories: [] });
  const locations = [{ id: "north", menuIds: [lunch.id, dinner.id] }];
  const locationRoutes = [{ path: "/locations/north/", location: locations[0] }];
  const routes = [
    { path: "/menu/lunch/", label: "Lunch", menu: lunch },
    { path: "/menu/dinner/", label: "Dinner", menu: dinner },
  ];
  const currentPath = "/menu/lunch/";
  const scope = menuLocationScopeForRoute(currentPath, lunch.id, locations, locationRoutes);

  assert.deepEqual(menuRoutesForLocation(routes, currentPath, scope).map(({ path }) => path), [
    currentPath,
    "/menu/dinner/",
  ]);
});
