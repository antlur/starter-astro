import assert from "node:assert/strict";
import test from "node:test";

import { fixtureSiteContent } from "../src/fixtures/site-content";
import { buildSiteFromContent, resolveGeneratedRouteSeo } from "../src/site/build";

const eventPath = "/events/community-supper/";

const routeTestContent = () => ({
  ...fixtureSiteContent,
  pages: [fixtureSiteContent.pages.find((page) => page.is_home)!],
  routePaths: ["/", eventPath],
  navigation: [],
  footerNavigation: [],
  menus: [],
  locations: [],
  pressReleases: [],
  events: [fixtureSiteContent.events[0]],
});

test("lets a canonical blueprint entry own an event-like path before module heuristics", async () => {
  const blueprint = {
    id: "blueprint-happenings",
    name: "Happenings",
    slug: "happenings",
    fields: [],
  };
  const resolvedPaths: string[] = [];
  const result = await buildSiteFromContent(routeTestContent(), async (requestedPath) => {
    resolvedPaths.push(requestedPath);
    return {
      type: "happening",
      data: { id: "community-supper-entry" },
      meta: {
        id: "community-supper-entry",
        type: "happening",
        path: requestedPath,
        blueprint,
      },
    };
  });

  assert.deepEqual(result.routePlan.blueprintRoutes.map(({ path, kind }) => [path, kind]), [[eventPath, "entry"]]);
  assert.ok(!result.routePlan.eventRoutes.some((route) => route.path === eventPath));
  assert.deepEqual(resolvedPaths, [eventPath]);
});

test("links blueprint index entries after route resolutions complete in separate build phases", async () => {
  const indexPath = "/events/";
  const entryPath = "/events/series-one/";
  const blueprint = {
    id: "blueprint-happenings",
    name: "Happenings",
    slug: "happenings",
    fields: [{ name: "Title", slug: "title", type: "text", is_primary: true, show_in_list: true }],
  };
  const content = {
    ...routeTestContent(),
    events: [],
    routePaths: ["/", indexPath, entryPath],
  };
  const resolvedPaths: string[] = [];
  const result = await buildSiteFromContent(content, async (requestedPath) => {
    resolvedPaths.push(requestedPath);

    if (requestedPath === indexPath) {
      return {
        type: "happenings",
        meta: { id: blueprint.id, type: "happenings", path: requestedPath, blueprint },
        data: [{ id: "series-one-entry", slug: "series-one", primary_field_value: "Series One", unstable_data: { title: "Series One" } }],
      };
    }

    return {
      type: "happening",
      meta: { id: "series-one-entry", type: "happening", path: requestedPath, blueprint },
      data: { id: "series-one-entry", slug: "series-one", primary_field_value: "Series One", unstable_data: { title: "Series One" } },
    };
  });

  const index = result.routePlan.blueprintRoutes.find((route) => route.kind === "index");
  assert.deepEqual(resolvedPaths, [indexPath, entryPath]);
  assert.ok(index && index.kind === "index");
  assert.deepEqual(index.entries.map(({ id, path }) => ({ id, path })), [
    { id: "series-one-entry", path: entryPath },
  ]);
});

test("keeps a canonical event on its heuristic event route without duplicate resolution", async () => {
  const event = fixtureSiteContent.events[0];
  const resolvedPaths: string[] = [];
  const result = await buildSiteFromContent(routeTestContent(), async (requestedPath) => {
    resolvedPaths.push(requestedPath);
    return {
      type: "event",
      data: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        start_time: event.startTime,
        end_time: event.endTime,
        timezone: event.timezone,
      },
      meta: { id: event.id, type: "event", path: requestedPath },
    };
  });

  assert.deepEqual(result.routePlan.eventRoutes.map(({ path, kind }) => [path, kind]), [[eventPath, "detail"]]);
  assert.deepEqual(result.routePlan.blueprintRoutes, []);
  assert.deepEqual(resolvedPaths, [eventPath]);
});

test("reuses build route resolutions for generated SEO and resolves only missing paths", async () => {
  const event = fixtureSiteContent.events[0];
  const resolvedPaths: string[] = [];
  const resolver = async (requestedPath: string) => {
    resolvedPaths.push(requestedPath);
    return {
      type: "event",
      data: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        start_time: event.startTime,
        end_time: event.endTime,
        timezone: event.timezone,
      },
      meta: {
        id: event.id,
        type: "event",
        path: requestedPath,
        seo: { title: "Community Supper SEO", description: "An event description." },
      },
    };
  };
  const build = await buildSiteFromContent(routeTestContent(), resolver);

  const seo = await resolveGeneratedRouteSeo([eventPath, "/generated/"], build.resolvedRoutes, resolver);

  assert.deepEqual(resolvedPaths, [eventPath, "/generated/"]);
  assert.deepEqual(seo.get(eventPath), {
    title: "Community Supper SEO",
    description: "An event description.",
    type: "event",
    id: event.id,
  });
  assert.equal(seo.get("/generated/")?.title, "Community Supper SEO");
});

test("keeps generated SEO empty when a static build has no route resolver", async () => {
  assert.deepEqual(await resolveGeneratedRouteSeo([eventPath], new Map()), new Map());
});

test("continues validating generated SEO resolver responses", async () => {
  await assert.rejects(
    resolveGeneratedRouteSeo([eventPath], new Map(), async () => ({ meta: { path: "/different/" } })),
    /different canonical route/,
  );
});

test("uses Backstage canonical ownership for a CMS page on an event-like path", async () => {
  const path = "/events/community-supper/";
  const page = {
    ...fixtureSiteContent.pages[1],
    id: "cms-event-path-page",
    slug: "community-supper",
    pathname: path,
  };
  const content = {
    ...fixtureSiteContent,
    pages: [...fixtureSiteContent.pages, page],
    routePaths: ["/", "/events/community-supper"],
    navigation: [],
    footerNavigation: [],
  };
  const resolvedPaths: string[] = [];

  const result = await buildSiteFromContent(content, async (requestedPath) => {
    resolvedPaths.push(requestedPath);

    if (requestedPath === path) {
      return {
        type: "page",
        data: { id: page.id },
        meta: { id: page.id, type: "page", path },
      };
    }

    return { type: "fixture", data: null, meta: { id: null, type: "fixture", path: requestedPath } };
  });

  assert.deepEqual(result.routePlan.cmsPages.map(({ path: routePath, page: routePage }) => [routePath, routePage.id]), [
    ["/", fixtureSiteContent.pages[0].id],
    [path, page.id],
  ]);
  assert.ok(!result.routePlan.eventRoutes.some((route) => route.path === path));
  assert.deepEqual(resolvedPaths, [path]);
});

test("resolves module slug collisions on custom base paths", async () => {
  const path = "/happenings/community-supper/";
  const event = { ...fixtureSiteContent.events[0], id: "custom-path-event", slug: "community-supper" };
  const eventData = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    start_time: event.startTime,
    end_time: event.endTime,
    timezone: event.timezone,
  };
  const page = {
    ...fixtureSiteContent.pages[1],
    id: "custom-path-page",
    slug: "community-supper",
    pathname: path,
  };
  const content = {
    ...fixtureSiteContent,
    pages: [...fixtureSiteContent.pages, page],
    events: [event],
    routePaths: ["/", path],
    navigation: [],
    footerNavigation: [],
  };

  const result = await buildSiteFromContent(content, async (requestedPath) => ({
    type: requestedPath === path ? "event" : "fixture",
    data: requestedPath === path ? eventData : null,
    meta: {
      id: requestedPath === path ? event.id : null,
      type: requestedPath === path ? "event" : "fixture",
      path: requestedPath,
    },
  }));

  assert.ok(!result.routePlan.cmsPages.some(({ path: routePath }) => routePath === path));
  assert.deepEqual(result.routePlan.eventRoutes.map(({ path: routePath, kind }) => [routePath, kind]), [[path, "detail"]]);
});

test("uses canonical page ownership for a duplicate custom module index path", async () => {
  const path = "/happenings/";
  const page = { ...fixtureSiteContent.pages[1], id: "custom-index-page", slug: "happenings", pathname: path };
  const content = {
    ...fixtureSiteContent,
    pages: [...fixtureSiteContent.pages, page],
    events: [],
    routePaths: ["/", path, path],
    navigation: [],
    footerNavigation: [],
  };

  const result = await buildSiteFromContent(content, async (requestedPath) => ({
    type: requestedPath === path ? "page" : "fixture",
    data: requestedPath === path ? { id: page.id } : null,
    meta: {
      id: requestedPath === path ? page.id : null,
      type: requestedPath === path ? "page" : "fixture",
      path: requestedPath,
    },
  }));

  assert.deepEqual(result.routePlan.cmsPages.filter(({ path: routePath }) => routePath === path).map(({ page: resolvedPage }) => resolvedPage.id), [page.id]);
  assert.ok(!result.routePlan.eventRoutes.some(({ path: routePath }) => routePath === path));
});
