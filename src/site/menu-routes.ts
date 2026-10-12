import type { SiteMenu } from "../lib/backstage/menus";
import type { SiteLocation } from "../lib/backstage/locations";
import { normalizeRoutePath } from "./routes";

export interface SiteMenuRoute {
  path: string;
  label: string;
  menu: SiteMenu;
}

export interface SiteLocationRoute {
  path: string;
  location: Pick<SiteLocation, "id" | "menuIds">;
}

export interface SiteMenuLocationScope {
  path: string | null;
  menuIds: readonly string[] | null;
  otherLocationPaths: readonly string[];
  ambiguous?: boolean;
}

const pathWithin = (path: string, parentPath: string): boolean => {
  const normalizedPath = normalizeRoutePath(path);
  const normalizedParent = normalizeRoutePath(parentPath);
  if (normalizedParent === "/") return normalizedPath === "/";
  return normalizedPath === normalizedParent || normalizedPath.startsWith(normalizedParent);
};

export const menuLocationScopeForRoute = (
  currentPath: string,
  currentMenuId: string,
  locations: readonly Pick<SiteLocation, "id" | "menuIds">[],
  locationRoutes: readonly SiteLocationRoute[],
): SiteMenuLocationScope | null => {
  const pathLocation = [...locationRoutes]
    .filter(({ path }) => pathWithin(currentPath, path))
    .sort((left, right) => normalizeRoutePath(right.path).length - normalizeRoutePath(left.path).length)[0];

  if (pathLocation) {
    return {
      path: normalizeRoutePath(pathLocation.path),
      menuIds: pathLocation.location.menuIds ?? null,
      otherLocationPaths: locationRoutes
        .filter(({ location }) => location.id !== pathLocation.location.id)
        .map(({ path }) => normalizeRoutePath(path)),
    };
  }

  const associatedLocations = locations.filter(({ menuIds }) => menuIds?.includes(currentMenuId));
  if (associatedLocations.length === 0) return null;
  if (associatedLocations.length > 1) {
    return {
      path: null,
      menuIds: null,
      otherLocationPaths: locationRoutes.map(({ path }) => normalizeRoutePath(path)),
      ambiguous: true,
    };
  }

  const location = associatedLocations[0];
  const locationRoute = locationRoutes.find(({ location: candidate }) => candidate.id === location.id);

  return {
    path: locationRoute ? normalizeRoutePath(locationRoute.path) : null,
    menuIds: location.menuIds ?? null,
    otherLocationPaths: locationRoutes
      .filter(({ location: candidate }) => candidate.id !== location.id)
      .map(({ path }) => normalizeRoutePath(path)),
  };
};

export const uniqueMenuRoutes = (
  routes: readonly SiteMenuRoute[],
  currentPath?: string,
): SiteMenuRoute[] => {
  const selectedRoutes: SiteMenuRoute[] = [];
  const routeIndexByMenu = new Map<string, number>();

  for (const route of routes) {
    const index = routeIndexByMenu.get(route.menu.id);
    if (index === undefined) {
      routeIndexByMenu.set(route.menu.id, selectedRoutes.length);
      selectedRoutes.push(route);
    } else if (route.path === currentPath) {
      selectedRoutes[index] = route;
    }
  }

  return selectedRoutes;
};

export const menuRoutesForLocation = (
  routes: readonly SiteMenuRoute[],
  currentPath: string,
  scope: SiteMenuLocationScope | null,
): SiteMenuRoute[] => {
  if (!scope) return uniqueMenuRoutes(routes, currentPath);

  const currentRoute = routes.find(({ path }) => normalizeRoutePath(path) === normalizeRoutePath(currentPath));
  if (scope.ambiguous || scope.menuIds === null) return currentRoute ? [currentRoute] : [];

  const allowedIds = new Set(scope.menuIds);
  const routesByMenu = new Map<string, SiteMenuRoute[]>();
  for (const route of routes) {
    if (!allowedIds.has(route.menu.id)) continue;
    routesByMenu.set(route.menu.id, [...(routesByMenu.get(route.menu.id) ?? []), route]);
  }

  const scopedRoutes: SiteMenuRoute[] = [];
  for (const candidates of routesByMenu.values()) {
    const localRoutes = scope.path
      ? candidates.filter(({ path }) => pathWithin(path, scope.path!))
      : [];

    if (localRoutes.length > 0) {
      scopedRoutes.push(...localRoutes);
      continue;
    }

    const routesOutsideOtherLocations = candidates.filter(({ path }) =>
      !scope.otherLocationPaths.some((otherPath) => pathWithin(path, otherPath)),
    );
    if (routesOutsideOtherLocations.length === 1) scopedRoutes.push(routesOutsideOtherLocations[0]);
    else {
      const currentAlias = routesOutsideOtherLocations.find(({ path }) => normalizeRoutePath(path) === normalizeRoutePath(currentPath));
      if (currentAlias) scopedRoutes.push(currentAlias);
    }
  }

  if (currentRoute && !scopedRoutes.some(({ path }) => normalizeRoutePath(path) === normalizeRoutePath(currentPath))) {
    scopedRoutes.unshift(currentRoute);
  }

  return uniqueMenuRoutes(scopedRoutes, currentPath);
};
