import assert from "node:assert/strict";
import test from "node:test";

import { fixtureContent } from "../src/fixtures/content";
import { fixtureRouteResolutions } from "../src/fixtures/routes";
import { fixtureSiteContent } from "../src/fixtures/site-content";
import { resolveBlueprintRoutes } from "../src/site/blueprint-routes";
import { buildSiteRoutePlan, normalizeRoutePath, pageForCanonicalRoute, reportUnhandledRoutes, resolveCanonicalPageRoutes } from "../src/site/routes";

test("uses a Backstage canonical route only when it resolves to the existing page ID", async () => {
  const sourcePage = {
    ...fixtureContent.pages[1],
    id: "live-page-id",
    slug: "inquiry",
    pathname: "/outdated/inquiry",
  };
  const resolution = {
    type: "page",
    meta: { type: "page", path: "/inquiry/" },
    data: { id: "live-page-id" },
  };

  assert.equal(pageForCanonicalRoute("/inquiry", resolution, [sourcePage])?.pathname, "/inquiry/");
  assert.equal(pageForCanonicalRoute("/inquiry", resolution, [{ ...sourcePage, id: "different-page" }]), null);

  const result = await resolveCanonicalPageRoutes(["/inquiry"], [sourcePage], async () => resolution);
  assert.equal(result.pages[0].id, "live-page-id");
  assert.deepEqual(result.unhandledPaths, []);
});

test("rejects a route resolver response for a different canonical path", () => {
  assert.throws(
    () => pageForCanonicalRoute("/requested", {
      type: "page",
      meta: { type: "page", path: "/other/" },
      data: { id: "page-1" },
    }, []),
    /different canonical page path/,
  );
});

test("generates CMS pages only when their pathname is in the Backstage site graph", () => {
  const content = {
    ...fixtureContent,
    pages: [
      ...fixtureContent.pages,
      {
        ...fixtureContent.pages[1],
        id: "unpublished-page",
        title: "Not public",
        pathname: "/not-public",
      },
    ],
  };
  const plan = buildSiteRoutePlan(content);

  assert.deepEqual(plan.cmsPages.map(({ path }) => path), ["/", "/about/"]);
  assert.deepEqual(plan.unhandledPaths, []);
});

test("reports canonical routes that require an application-owned Astro page", () => {
  const content = {
    ...fixtureContent,
    routePaths: [...fixtureContent.routePaths, "/private-events"],
    navigation: [
      ...fixtureContent.navigation,
      { id: "private-events-link", text: "Private events", url: "/private-events/", newWindow: false, children: [] },
    ],
  };
  const plan = buildSiteRoutePlan(content, ["/private-events/"]);

  assert.deepEqual(plan.applicationPaths, ["/private-events/"]);
  assert.deepEqual(plan.unhandledPaths, []);
  assert.equal(plan.navigation.at(-1)?.url, "/private-events/");
});

test("generates static menu routes from Backstage navigation relationships", () => {
  const plan = buildSiteRoutePlan(fixtureSiteContent);

  assert.deepEqual(plan.menuRoutes.map(({ path, label, menu }) => ({ path, label, title: menu.title })), [
    { path: "/menu/", label: "Menu", title: "All Day" },
    { path: "/menu/all-day/", label: "All Day", title: "All Day" },
  ]);
  assert.deepEqual(plan.menuIndexPaths, []);
  assert.ok(plan.applicationPaths.includes("/menu/"));
  assert.ok(plan.navigation.some(({ url }) => url === "/menu/"));
});

test("generates event, location, and blueprint routes from the Backstage route graph", async () => {
  const initialPlan = buildSiteRoutePlan(fixtureSiteContent);
  const resolved = await resolveBlueprintRoutes(initialPlan.unhandledPaths, async (path) => fixtureRouteResolutions[path]);
  const plan = buildSiteRoutePlan(fixtureSiteContent, [], resolved.routes);

  assert.deepEqual(plan.eventRoutes.map(({ path, kind }) => [path, kind]), [
    ["/events/", "index"],
    ["/events/community-supper/", "detail"],
  ]);
  assert.deepEqual(plan.locationRoutes.map(({ path, location }) => [path, location.slug]), [
    ["/location/", "main-street"],
  ]);
  assert.ok(plan.applicationPaths.includes("/events/"));
  assert.ok(plan.applicationPaths.includes("/location/"));
  assert.deepEqual(plan.unhandledPaths, []);
  assert.deepEqual(plan.blueprintRoutes.map(({ path }) => path), [
    "/happenings/",
    "/locations/fieldwork/community-supper/",
  ]);
});

test("gives a duplicated system Events index path precedence over a CMS page", () => {
  const cmsEventsPage = {
    ...fixtureContent.pages[1],
    id: "cms-events-page",
    title: "Events CMS page",
    slug: "events",
    pathname: "/events",
  };
  const plan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    pages: [...fixtureSiteContent.pages, cmsEventsPage],
    events: [],
    routePaths: [
      ...fixtureSiteContent.routePaths.filter((path) => path !== "/events/community-supper/"),
      "/events/",
    ],
  });

  assert.ok(plan.eventRoutes.some((route) => route.path === "/events/" && route.kind === "index"));
  assert.ok(!plan.cmsPages.some((route) => route.path === "/events/"));
  assert.ok(!plan.unhandledPaths.includes("/events/"));
});

test("renders an Events index when the module has no published events", () => {
  const plan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    events: [],
    routePaths: fixtureSiteContent.routePaths.filter((path) => !path.startsWith("/events/")),
  });

  assert.deepEqual(plan.eventRoutes, [{ path: "/events/", kind: "index" }]);
  assert.ok(!plan.unhandledPaths.includes("/events/"));
});

test("generates Press index and detail routes from the Backstage route graph", () => {
  const plan = buildSiteRoutePlan(fixtureSiteContent);

  assert.deepEqual(plan.pressRoutes.map((route) => [route.path, route.kind]), [
    ["/press/", "index"],
    ["/press/community-supper-in-the-neighborhood/", "detail"],
  ]);
  assert.ok(plan.applicationPaths.includes("/press/"));
  assert.ok(plan.applicationPaths.includes("/press/community-supper-in-the-neighborhood/"));
  assert.ok(!plan.unhandledPaths.includes("/press/"));
  assert.ok(!plan.unhandledPaths.includes("/press/community-supper-in-the-neighborhood/"));
});

test("keeps generated Press paths unhandled when the canonical record is missing", () => {
  const plan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    pressReleases: [],
  });

  assert.deepEqual(plan.pressRoutes.map(({ path }) => path), ["/press/"]);
  assert.ok(plan.unhandledPaths.includes("/press/community-supper-in-the-neighborhood/"));
});

test("fails on duplicate Backstage paths and CMS/application path collisions", () => {
  assert.throws(
    () => buildSiteRoutePlan({ ...fixtureContent, routePaths: ["/", "/about", "/about/"] }),
    /Backstage site graph contains duplicate routes: \/about\//,
  );

  assert.throws(
    () => buildSiteRoutePlan(fixtureContent, ["/about/"]),
    /Application route \/about\/ collides with a Backstage CMS page/,
  );

  assert.throws(
    () => buildSiteRoutePlan({
      ...fixtureSiteContent,
      routePaths: [...fixtureSiteContent.routePaths, "/menu/all-day/"],
    }),
    /Backstage site graph contains duplicate routes: \/menu\/all-day\//,
  );

  assert.throws(
    () => buildSiteRoutePlan({
      ...fixtureSiteContent,
      routePaths: [...fixtureSiteContent.routePaths, "/press/"],
    }),
    /Backstage site graph contains duplicate routes: \/press\//,
  );
});

test("production indexing refuses to publish unhandled Backstage routes", () => {
  const plan = buildSiteRoutePlan({
    ...fixtureContent,
    routePaths: [...fixtureContent.routePaths, "/unhandled"],
    navigation: [
      ...fixtureContent.navigation,
      { id: "unhandled-link", text: "Unsupported", url: "/unhandled/", newWindow: false, children: [] },
    ],
  });

  assert.deepEqual(plan.unhandledPaths, ["/unhandled/"]);
  assert.deepEqual(plan.navigation.map(({ url }) => url), ["/", "/about/"]);
  assert.throws(() => reportUnhandledRoutes(plan.unhandledPaths, true), /Backstage routes are not rendered/);
});

test("route paths must be absolute, safe paths", () => {
  assert.equal(normalizeRoutePath("/about"), "/about/");
  assert.equal(normalizeRoutePath("/"), "/");
  assert.throws(() => normalizeRoutePath("//example.test"), /safe absolute paths/);
  assert.throws(() => normalizeRoutePath("/about?preview=true"), /safe absolute paths/);
  assert.throws(() => normalizeRoutePath("/../private"), /safe absolute paths/);
});
