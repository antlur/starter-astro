import type { SiteMenu } from "../lib/backstage/menus";

export interface SiteMenuRoute {
  path: string;
  label: string;
  menu: SiteMenu;
}

export const uniqueMenuRoutes = (
  routes: readonly SiteMenuRoute[],
  currentPath?: string,
): SiteMenuRoute[] => {
  const routesByMenu = new Map<string, SiteMenuRoute>();

  for (const route of routes) {
    const existing = routesByMenu.get(route.menu.id);
    if (!existing || route.path === currentPath) routesByMenu.set(route.menu.id, route);
  }

  return [...routesByMenu.values()];
};
