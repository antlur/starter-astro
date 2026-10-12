import assert from "node:assert/strict";
import test from "node:test";

import { fixtureSiteContent } from "../src/fixtures/site-content";
import { buildSiteFromContent } from "../src/site/build";

const event = fixtureSiteContent.events[0];
const eventData = {
  id: event.id,
  slug: event.slug,
  title: event.title,
  start_time: event.startTime,
  end_time: event.endTime,
  timezone: event.timezone,
};

const contentWithUpcomingBlock = (routePaths: string[]) => {
  const homePage = fixtureSiteContent.pages.find((page) => page.is_home)!;

  return {
    ...fixtureSiteContent,
    pages: [{
      ...homePage,
      blocks: [
        ...homePage.blocks,
        {
          id: "upcoming-events-test",
          type: "upcoming-events" as const,
          fields: {},
          events: [],
          eventsIndexPath: "/events/",
        },
      ],
    }],
    routePaths,
    navigation: [],
    footerNavigation: [],
    menus: [],
    locations: [],
    pressReleases: [],
    events: [event],
  };
};

test("uses canonical custom-base event and index paths for event links", async () => {
  const detailPath = "/happenings/community-supper/";
  const indexPath = "/happenings/";
  const resolvedPaths: string[] = [];
  const result = await buildSiteFromContent(
    contentWithUpcomingBlock(["/", indexPath, detailPath]),
    async (path) => {
      resolvedPaths.push(path);
      const isIndex = path === indexPath;

      return {
        type: isIndex ? "events" : "event",
        data: isIndex ? [eventData] : eventData,
        meta: {
          id: isIndex ? null : event.id,
          type: isIndex ? "events" : "event",
          path,
        },
      };
    },
  );

  assert.deepEqual(new Set(resolvedPaths), new Set([indexPath, detailPath]));
  assert.equal(result.routePlan.eventsIndexPath, indexPath);
  assert.deepEqual(result.routePlan.eventRoutes.map(({ path, kind }) => [path, kind]), [
    [indexPath, "index"],
    [detailPath, "detail"],
  ]);
  assert.equal(result.content.events[0].publicPath, detailPath);

  const block = result.content.pages[0].blocks.find(({ type }) => type === "upcoming-events");
  assert.ok(block && block.type === "upcoming-events");
  assert.equal(block.eventsIndexPath, indexPath);
  assert.equal(block.events?.[0]?.publicPath, detailPath);
});

test("clears guessed event links when a blueprint owns the event-shaped path", async () => {
  const path = "/events/community-supper/";
  const blueprint = { id: "happenings", name: "Happenings", slug: "happenings", fields: [] };
  const result = await buildSiteFromContent(contentWithUpcomingBlock(["/", path]), async (requestedPath) => ({
    type: "happening",
    data: { id: "community-supper-entry" },
    meta: {
      id: "community-supper-entry",
      type: "happening",
      path: requestedPath,
      blueprint,
    },
  }));

  assert.ok(result.routePlan.blueprintRoutes.some((route) => route.path === path));
  assert.ok(!result.routePlan.eventRoutes.some((route) => route.path === path));
  assert.equal(result.content.events[0].publicPath, null);

  const block = result.content.pages[0].blocks.find(({ type }) => type === "upcoming-events");
  assert.ok(block && block.type === "upcoming-events");
  assert.equal(block.events?.[0]?.publicPath, null);
  assert.equal(block.eventsIndexPath, null);
});
