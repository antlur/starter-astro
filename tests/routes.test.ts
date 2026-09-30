import assert from "node:assert/strict";
import test from "node:test";

import { fixtureContent } from "../src/fixtures/content";
import { buildSiteRoutePlan, normalizeRoutePath, reportUnhandledRoutes } from "../src/site/routes";

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
    routePaths: [...fixtureContent.routePaths, "/events"],
    navigation: [
      ...fixtureContent.navigation,
      { id: "events-link", text: "Events", url: "/events/", newWindow: false, children: [] },
    ],
  };
  const plan = buildSiteRoutePlan(content, ["/events/"]);

  assert.deepEqual(plan.applicationPaths, ["/events/"]);
  assert.deepEqual(plan.unhandledPaths, []);
  assert.equal(plan.navigation.at(-1)?.url, "/events/");
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
});

test("production indexing refuses to publish unhandled Backstage routes", () => {
  const plan = buildSiteRoutePlan({
    ...fixtureContent,
    routePaths: [...fixtureContent.routePaths, "/events"],
    navigation: [
      ...fixtureContent.navigation,
      { id: "events-link", text: "Events", url: "/events/", newWindow: false, children: [] },
    ],
  });

  assert.deepEqual(plan.unhandledPaths, ["/events/"]);
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
