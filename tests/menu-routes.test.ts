import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMenu } from "../src/lib/backstage/menus";
import { uniqueMenuRoutes } from "../src/site/menu-routes";

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
