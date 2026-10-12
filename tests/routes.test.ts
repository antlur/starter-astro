import assert from "node:assert/strict";
import test from "node:test";

import { fixtureContent } from "../src/fixtures/content";
import { fixtureRouteResolutions } from "../src/fixtures/routes";
import { fixtureSiteContent } from "../src/fixtures/site-content";
import { loadResolvedMenuMedia } from "../src/lib/backstage/content";
import { resolveBlueprintRoutes } from "../src/site/blueprint-routes";
import { addResolvedModuleContent, assertStaticRoutesEmitted, buildSiteRoutePlan, normalizeRoutePath, pageForCanonicalRoute, reportUnhandledRoutes, resolveCanonicalPageRoutes } from "../src/site/routes";

test("fails indexable builds when later publication filters omit planned menu and location routes", () => {
  const menu = { ...fixtureSiteContent.menus[0], isPublished: false };
  const location = {
    id: "draft-location",
    slug: "draft-location",
    status: "draft",
    isPublic: false,
    name: "Draft location",
    description: null,
    addressLines: [],
    phone: null,
    email: null,
    mapUrl: null,
    mapEmbedUrl: null,
    latitude: null,
    longitude: null,
    timezone: null,
    imageUrl: null,
    imageAlt: "",
    loyaltyUrl: null,
    hours: [],
  };
  const routePlan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    menus: [menu],
    locations: [location],
    routePaths: [...fixtureSiteContent.routePaths, "/location/draft-location"],
  });
  const emittedPaths = [
    ...routePlan.cmsPages.map(({ path }) => path),
    ...routePlan.blueprintRoutes.map(({ path }) => path),
    ...routePlan.menuRoutes.filter(({ menu: candidate }) => candidate.isPublished !== false).map(({ path }) => path),
    ...routePlan.menuIndexPaths,
    ...routePlan.eventRoutes.map(({ path }) => path),
    ...routePlan.locationRoutes.filter(({ location: candidate }) => candidate.isPublic !== false).map(({ path }) => path),
    ...routePlan.locationIndexPaths,
    ...routePlan.pressRoutes.map(({ path }) => path),
  ];

  assert.ok(routePlan.menuRoutes.some(({ path }) => path === "/menu/"));
  assert.ok(routePlan.locationRoutes.some(({ path }) => path === "/location/draft-location/"));
  assert.throws(
    () => assertStaticRoutesEmitted(routePlan, emittedPaths, true),
    /Indexable build omitted planned Backstage routes: \/menu\/, \/menu\/all-day\/, \/location\/, \/location\/draft-location\//,
  );
});

test("preserves noindex builds when unpublished routes are intentionally omitted", () => {
  const routePlan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    menus: [{ ...fixtureSiteContent.menus[0], isPublished: false }],
  });

  assert.doesNotThrow(() => assertStaticRoutesEmitted(routePlan, [], false));
});

test("fails an indexable build when a planned menu index has no selectable menu", () => {
  const menu = { ...fixtureSiteContent.menus[0], isPublished: false };
  const routePlan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    menus: [menu],
    navigation: [{
      id: "published-menu-detail",
      text: "All Day",
      url: "/menu/all-day/",
      newWindow: false,
      menuId: menu.id,
      children: [],
    }],
  });
  const emittedPaths = [
    ...routePlan.cmsPages.map(({ path }) => path),
    ...routePlan.blueprintRoutes.map(({ path }) => path),
    ...routePlan.menuRoutes.filter(({ menu: candidate }) => candidate.isPublished !== false).map(({ path }) => path),
    ...routePlan.eventRoutes.map(({ path }) => path),
    ...routePlan.locationRoutes.map(({ path }) => path),
    ...routePlan.locationIndexPaths,
    ...routePlan.pressRoutes.map(({ path }) => path),
  ];

  assert.deepEqual(routePlan.menuIndexPaths, ["/menu/"]);
  assert.throws(
    () => assertStaticRoutesEmitted(routePlan, emittedPaths, true),
    /Indexable build omitted planned Backstage routes: \/menu\/all-day\/, \/menu\//,
  );
});

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

test("bounds canonical route resolution and preserves route order", async () => {
  const pages = Array.from({ length: 12 }, (_, index) => ({
    ...fixtureContent.pages[1],
    id: `page-${index}`,
    slug: `page-${index}`,
    pathname: `/page-${index}/`,
  }));
  const paths = pages.map((page) => page.pathname);
  let active = 0;
  let maxActive = 0;

  const result = await resolveCanonicalPageRoutes(paths, pages, async (path) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    const page = pages.find((candidate) => candidate.pathname === path)!;
    return { type: "page", meta: { type: "page", path }, data: { id: page.id } };
  });

  assert.equal(maxActive, 4);
  assert.deepEqual(result.pages.map((page) => page.pathname), paths);
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
  const fixtureWithoutResolvedMenu = {
    ...fixtureSiteContent,
    routePaths: fixtureSiteContent.routePaths.filter((path) => path !== "/locations/fieldwork/seasonal-menu"),
  };
  const initialPlan = buildSiteRoutePlan(fixtureWithoutResolvedMenu);
  const resolved = await resolveBlueprintRoutes(initialPlan.unhandledPaths, async (path) => fixtureRouteResolutions[path]);
  const plan = buildSiteRoutePlan(fixtureWithoutResolvedMenu, [], resolved.routes);

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

test("resolves module routes using Backstage canonical paths instead of fixed slugs", async () => {
  const paths = [
    "/happenings/",
    "/happenings/community-dinner/",
    "/dinner/",
    "/visit/",
    "/find-us/",
    "/news/",
    "/news/neighborhood-award/",
  ];
  const event = {
    id: "event-custom",
    slug: "community-dinner",
    title: "Community dinner",
    start_time: "2027-04-10T18:00:00-05:00",
    end_time: null,
  };
  const menu = {
    id: "menu-custom",
    title: "Dinner",
    slug: "dinner",
    categories: [],
  };
  const location = { id: "location-custom", slug: "downtown", name: "Downtown" };
  const pressRelease = {
    id: "press-custom",
    slug: "neighborhood-award",
    title: "Neighborhood award",
    source: "Neighborhood Journal",
    published_at: "2026-09-01T00:00:00Z",
  };
  const resolutions: Record<string, unknown> = {
    "/happenings/": { type: "events", data: [event], meta: { id: null, type: "events", path: "/happenings/" } },
    "/happenings/community-dinner/": { type: "event", data: event, meta: { id: event.id, type: "event", path: "/happenings/community-dinner/" } },
    "/dinner/": { type: "menu", data: menu, meta: { id: menu.id, type: "menu", path: "/dinner/" } },
    "/visit/": { type: "location", data: location, meta: { id: location.id, type: "location", path: "/visit/" } },
    "/find-us/": { type: "locations", data: [location], meta: { id: null, type: "locations", path: "/find-us/" } },
    "/news/": { type: "presses", data: [pressRelease], meta: { id: null, type: "presses", path: "/news/" } },
    "/news/neighborhood-award/": { type: "press", data: pressRelease, meta: { id: pressRelease.id, type: "press", path: "/news/neighborhood-award/" } },
  };
  const unresolved = await resolveCanonicalPageRoutes(paths, fixtureContent.pages, async (path) => resolutions[path]);
  const content = addResolvedModuleContent({
    ...fixtureSiteContent,
    routePaths: ["/", "/about", ...paths],
    events: [],
    menus: [],
    locations: [],
    pressReleases: [],
  }, unresolved.resolutions);
  const plan = buildSiteRoutePlan(content, [], [], unresolved.resolutions);

  assert.deepEqual(unresolved.unhandledPaths, paths);
  assert.deepEqual(plan.eventRoutes.map(({ path, kind }) => [path, kind]), [
    ["/happenings/", "index"],
    ["/happenings/community-dinner/", "detail"],
  ]);
  assert.deepEqual(plan.menuRoutes.map(({ path, menu: resolvedMenu }) => [path, resolvedMenu.id]), [["/dinner/", "menu-custom"]]);
  assert.deepEqual(plan.locationRoutes.map(({ path, location: resolvedLocation }) => [path, resolvedLocation.id]), [["/visit/", "location-custom"]]);
  assert.deepEqual(plan.locationIndexPaths, ["/find-us/"]);
  assert.deepEqual(plan.pressRoutes.map(({ path, kind }) => [path, kind]), [
    ["/news/", "index"],
    ["/news/neighborhood-award/", "detail"],
  ]);
  assert.deepEqual(plan.unhandledPaths, []);
  assert.equal(content.events[0].publicPath, "/happenings/community-dinner/");
  assert.equal(content.pressReleases[0].publicPath, "/news/neighborhood-award/");
  assert.equal(content.events[0].title, "Community dinner");
  assert.equal(content.pressReleases[0].title, "Neighborhood award");
});

test("resolved Press indexes hydrate only records with canonical public detail routes", () => {
  const publicRelease = {
    id: "press-public",
    slug: "record-slug-differs-from-route",
    title: "Public announcement",
    source: "Community Journal",
    published_at: "2026-09-01T00:00:00Z",
  };
  const resolutions = [
    {
      path: "/announcements/",
      value: {
        type: "presses",
        data: [
          publicRelease,
          { id: "press-draft", slug: "draft", title: "Draft", source: "", published_at: "not-a-date" },
          { id: "press-scheduled", slug: "scheduled", title: "Scheduled", source: "Journal", published_at: "2027-01-01T00:00:00Z" },
        ],
        meta: { id: null, type: "presses", path: "/announcements/" },
      },
    },
    {
      path: "/announcements/winter-update/",
      value: {
        type: "press",
        data: publicRelease,
        meta: { id: publicRelease.id, type: "press", path: "/announcements/winter-update/" },
      },
    },
  ];

  const result = addResolvedModuleContent({
    ...fixtureSiteContent,
    pressReleases: [],
  }, resolutions);

  assert.deepEqual(result.pressReleases.map(({ id, slug, publicPath }) => ({ id, slug, publicPath })), [{
    id: publicRelease.id,
    slug: publicRelease.slug,
    publicPath: "/announcements/winter-update/",
  }]);
});

test("resolved Events collections retain timezone enrichment and canonical public paths", () => {
  const existingEvent = {
    ...fixtureSiteContent.events[0],
    id: "event-resolved",
    slug: "old-event-slug",
    timezone: "America/Chicago",
    publicPath: "/old-events/old-event-slug/",
  };
  const resolvedEvent = {
    id: existingEvent.id,
    slug: "new-event-slug",
    title: "Community Supper",
    start_time: "2027-04-10T18:00:00-05:00",
    end_time: null,
    timezone: null,
  };
  const resolutions = [
    {
      path: "/happenings/",
      value: { type: "events", data: [resolvedEvent], meta: { id: null, type: "events", path: "/happenings/" } },
    },
    {
      path: "/happenings/supper/",
      value: {
        type: "event",
        data: resolvedEvent,
        meta: { id: existingEvent.id, type: "event", path: "/happenings/supper/" },
      },
    },
  ];

  const result = addResolvedModuleContent({
    ...fixtureSiteContent,
    events: [existingEvent],
    locations: [{ ...fixtureSiteContent.locations[0], timezone: "America/Chicago" }],
  }, resolutions);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].timezone, "America/Chicago");
  assert.equal(result.events[0].publicPath, "/happenings/supper/");
});

test("canonical route type and ID own paths when module slugs overlap", () => {
  const sharedSlug = "shared";
  const event = { ...fixtureSiteContent.events[0], id: "event-shared", slug: sharedSlug };
  const menu = { ...fixtureSiteContent.menus[0], id: "menu-shared", slug: sharedSlug };
  const location = { ...fixtureSiteContent.locations[0], id: "location-shared", slug: sharedSlug };
  const release = { ...fixtureSiteContent.pressReleases[0], id: "press-shared", slug: sharedSlug };
  const paths = ["/events/shared/", "/menu/shared/", "/visit/shared/", "/news/shared/"];
  const content = {
    ...fixtureSiteContent,
    events: [event],
    menus: [menu],
    locations: [location],
    pressReleases: [release],
    routePaths: [...fixtureContent.routePaths, ...paths],
    navigation: [],
  };
  const resolutions = [
    { path: paths[0], value: { type: "menu", data: { id: menu.id }, meta: { id: menu.id, type: "menu", path: paths[0] } } },
    { path: paths[1], value: { type: "event", data: { id: event.id }, meta: { id: event.id, type: "event", path: paths[1] } } },
    { path: paths[2], value: { type: "location", data: { id: location.id }, meta: { id: location.id, type: "location", path: paths[2] } } },
    { path: paths[3], value: { type: "press", data: { id: release.id }, meta: { id: release.id, type: "press", path: paths[3] } } },
  ];
  const plan = buildSiteRoutePlan(content, [], [], resolutions);

  assert.deepEqual(plan.menuRoutes.map(({ path, menu: resolvedMenu }) => [path, resolvedMenu.id]), [[paths[0], menu.id]]);
  assert.deepEqual(plan.eventRoutes.map((route) => [route.path, route.kind, route.kind === "detail" ? route.event.id : null]), [[paths[1], "detail", event.id]]);
  assert.deepEqual(plan.locationRoutes.map(({ path, location: resolvedLocation }) => [path, resolvedLocation.id]), [[paths[2], location.id]]);
  assert.deepEqual(plan.pressRoutes.map((route) => [route.path, route.kind, route.kind === "detail" ? route.release.id : null]), [[paths[3], "detail", release.id]]);
  const generatedPaths = [
    ...plan.menuRoutes.map(({ path }) => path),
    ...plan.eventRoutes.map(({ path }) => path),
    ...plan.locationRoutes.map(({ path }) => path),
    ...plan.pressRoutes.map(({ path }) => path),
  ];
  assert.equal(new Set(generatedPaths).size, generatedPaths.length);
  assert.deepEqual(plan.unhandledPaths, []);
});

test("a canonical CMS page owns a path that resembles an event slug", () => {
  const path = "/events/shared/";
  const page = { ...fixtureContent.pages[1], id: "canonical-page", slug: "shared", pathname: path };
  const plan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    pages: [...fixtureContent.pages, page],
    events: [{ ...fixtureSiteContent.events[0], slug: "shared" }],
    navigation: [],
    routePaths: [...fixtureContent.routePaths, path],
  }, [], [], [{
    path,
    value: { type: "page", data: { id: page.id }, meta: { id: page.id, type: "page", path } },
  }]);

  assert.deepEqual(plan.cmsPages.filter((route) => route.path === path).map(({ page: resolvedPage }) => resolvedPage.id), [page.id]);
  assert.ok(!plan.eventRoutes.some((route) => route.path === path));
  assert.deepEqual(plan.unhandledPaths, []);
});

test("leaves ambiguous or missing canonical content unhandled instead of guessing by slug", () => {
  const event = { ...fixtureSiteContent.events[0], slug: "shared" };
  const menu = { ...fixtureSiteContent.menus[0], slug: "shared" };
  const path = "/events/shared/";
  const ambiguousPlan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    events: [event],
    menus: [menu],
    navigation: [],
    routePaths: [...fixtureContent.routePaths, path],
  });

  assert.ok(!ambiguousPlan.eventRoutes.some((route) => route.path === path));
  assert.ok(ambiguousPlan.unhandledPaths.includes(path));

  const missingPath = "/events/community-supper/";
  const missingIdPlan = buildSiteRoutePlan({
    ...fixtureSiteContent,
    pages: [...fixtureContent.pages, { ...fixtureContent.pages[1], id: "wrong-owner-page", slug: "community-supper", pathname: missingPath }],
    navigation: [],
    routePaths: [...fixtureContent.routePaths, missingPath],
  }, [], [], [{
    path: missingPath,
    value: { type: "event", data: { id: "missing-event" }, meta: { id: "missing-event", type: "event", path: missingPath } },
  }]);

  assert.ok(!missingIdPlan.eventRoutes.some((route) => route.path === missingPath));
  assert.ok(!missingIdPlan.cmsPages.some((route) => route.path === missingPath));
  assert.ok(missingIdPlan.unhandledPaths.includes(missingPath));
});

test("keeps nested blueprint entries distinct from location slugs and supports a root location", async () => {
  const entryPath = "/locations/fieldwork/community-supper/";
  const resolution = fixtureRouteResolutions[entryPath];
  const blueprintResult = await resolveBlueprintRoutes([entryPath], async () => resolution);
  const content = {
    ...fixtureSiteContent,
    locations: [{ ...fixtureSiteContent.locations[0], slug: "community-supper" }],
    events: [],
    routePaths: [...fixtureContent.routePaths, "/location/", entryPath],
  };
  const plan = buildSiteRoutePlan(content, [], blueprintResult.routes, [{ path: entryPath, value: resolution }]);

  assert.deepEqual(plan.locationRoutes.map(({ path }) => path), ["/location/"]);
  assert.deepEqual(plan.blueprintRoutes.map(({ path }) => path), [entryPath]);
  assert.deepEqual(plan.unhandledPaths, []);
});

test("orders shared menu routes by nested navigation while preserving canonical menu IDs", () => {
  const menu = { ...fixtureSiteContent.menus[0], id: "shared-menu", slug: "unrelated-slug" };
  const paths = ["/menus/late/", "/menus/early/"];
  const content = {
    ...fixtureSiteContent,
    menus: [menu],
    navigation: [{
      id: "menu-group",
      text: "Menus",
      url: "#",
      newWindow: false,
      children: [
        { id: "early-menu-link", text: "Early", url: paths[1], newWindow: false, menuId: menu.id, children: [] },
        { id: "late-menu-link", text: "Late", url: paths[0], newWindow: false, menuId: menu.id, children: [] },
      ],
    }],
    routePaths: [...fixtureContent.routePaths, ...paths],
  };
  const resolutions = paths.map((path) => ({
    path,
    value: { type: "menu", data: { id: menu.id }, meta: { id: menu.id, type: "menu", path } },
  }));
  const plan = buildSiteRoutePlan(content, [], [], resolutions);

  assert.deepEqual(plan.menuRoutes.map(({ path, label, menu: resolvedMenu }) => [path, label, resolvedMenu.id]), [
    [paths[1], "Early", menu.id],
    [paths[0], "Late", menu.id],
  ]);
});

test("hydrates media for a route-resolved menu and preserves local image overrides", async () => {
  const resolution = {
    path: "/locations/fieldwork/dinner/",
    value: {
      type: "menu",
      data: {
        id: "menu-resolved",
        title: "Dinner",
        slug: "dinner",
        categories: [{
          title: "Mains",
          items: [
            {
              title: "Local image override",
              image_id: "local-image",
              menu_item: { image_id: "global-image" },
            },
            {
              title: "Global catalog image",
              menu_item: { image_id: "global-image" },
            },
          ],
        }],
      },
      meta: { id: "menu-resolved", type: "menu", path: "/locations/fieldwork/dinner/" },
    },
  };
  const requestedIds: string[] = [];
  const media = new Map([
    ["local-image", { url: "https://images.example.test/local.jpg", alt: "Local dish", width: 800, height: 600 }],
    ["global-image", { url: "https://images.example.test/global.jpg", alt: "Catalog dish", width: 640, height: 480 }],
  ]);
  const menuMedia = await loadResolvedMenuMedia([resolution], {
    media: {
      get: async (id: string) => {
        requestedIds.push(id);
        return media.get(id) ?? null;
      },
    },
  });
  const content = addResolvedModuleContent({ ...fixtureSiteContent, menus: [] }, [resolution], menuMedia);
  const items = content.menus[0].categories[0].items;

  assert.deepEqual(requestedIds, ["local-image", "global-image"]);
  assert.deepEqual(
    items.map(({ imageUrl, imageAlt, imageWidth, imageHeight }) => [imageUrl, imageAlt, imageWidth, imageHeight]),
    [
      ["https://images.example.test/local.jpg", "Local dish", 800, 600],
      ["https://images.example.test/global.jpg", "Catalog dish", 640, 480],
    ],
  );
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
