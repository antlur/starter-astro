import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPublicLocation, locationSchemaUrl, normalizeLocation } from "../src/lib/backstage/locations";

test("builds a location-specific structured-data URL when the site origin is configured", () => {
  const site = new URL("https://fieldwork.example.test");

  assert.equal(locationSchemaUrl(site, "/locations/north/"), "https://fieldwork.example.test/locations/north/");
  assert.equal(locationSchemaUrl(site, "/locations/south/"), "https://fieldwork.example.test/locations/south/");
  assert.equal(locationSchemaUrl(undefined, "/locations/north/"), undefined);
});

test("normalizes grouped Backstage hours and collapses adjacent matching days", () => {
  const location = normalizeLocation({
    id: "location-1",
    name: "Franklin Ave",
    address: "9700 Franklin Ave",
    city: "Franklin Park",
    state: "IL",
    zip: "60131",
    phone: "(847) 349-9325",
    map_link: "https://maps.example.test/restaurant",
    featured_media: { url: "https://cdn.example.test/location.jpg", alt: "Dining room", width: 1600, height: 1000 },
    hours: [{
      label: "",
      days: [
        ...["Monday", "Tuesday", "Wednesday", "Thursday"].map((day) => ({ day, openTime: "10:00", closeTime: "23:00" })),
        { day: "Friday", openTime: "10:00", closeTime: "00:00" },
        { day: "Saturday", openTime: "11:00", closeTime: "00:00" },
        { day: "Sunday", openTime: "11:00", closeTime: "22:00" },
      ],
    }],
  });

  assert.deepEqual(location.addressLines, ["9700 Franklin Ave", "Franklin Park, IL 60131"]);
  assert.deepEqual(location.hours.map(({ day, value }) => ({ day, value })), [
    { day: "Mon-Thu", value: "10 AM - 11 PM" },
    { day: "Fri", value: "10 AM - 12 AM" },
    { day: "Sat", value: "11 AM - 12 AM" },
    { day: "Sun", value: "11 AM - 10 PM" },
  ]);
  assert.equal(location.mapUrl, "https://maps.example.test/restaurant");
  assert.equal(location.imageWidth, 1600);
  assert.equal(location.imageHeight, 1000);
});

test("omits unsafe map URLs and respects closed, hidden, and 24-hour days", () => {
  const location = normalizeLocation({
    name: "All day",
    map_link: "javascript:alert(1)",
    hours: [
      { day: "Monday", closed24Hours: true },
      { day: "Tuesday", open24Hours: true },
      { day: "Wednesday", hidden: true, openTime: "09:00", closeTime: "17:00" },
    ],
  });

  assert.equal(location.mapUrl, null);
  assert.deepEqual(location.hours.map(({ day, value }) => ({ day, value })), [
    { day: "Mon", value: "Closed" },
    { day: "Tue", value: "Open 24 hours" },
  ]);
});

test("preserves associated menus and accepts Backstage Google Maps embed URLs", () => {
  const location = normalizeLocation({
    id: "location-1",
    menus: [{ id: "menu-dinner" }, { id: 23 }, { title: "Missing ID" }, { id: "menu-dinner" }],
    map_embed: "https://www.google.com/maps/embed/v1/place?key=test-key&q=Main+Street&zoom=14",
  });

  assert.deepEqual(location.menuIds, ["menu-dinner", "23"]);
  assert.equal(location.mapEmbedUrl, "https://www.google.com/maps/embed/v1/place?key=test-key&q=Main+Street&zoom=14");
  assert.equal(normalizeLocation({ id: "legacy" }).menuIds, null);
  assert.deepEqual(normalizeLocation({ id: "empty", menus: [] }).menuIds, []);
});

test("preserves location status and matches Backstage's public route status rules", () => {
  const legacy = normalizeLocation({ id: "legacy", status_text: "Legacy" });
  const draft = normalizeLocation({ id: "draft", status: "draft", status_text: "Draft" });
  const closed = normalizeLocation({ id: "closed", status: "closed", status_text: "Closed" });
  const opening = normalizeLocation({ id: "opening", status: "opening" });
  const open = normalizeLocation({ id: "open", status: "open" });
  const closing = normalizeLocation({ id: "closing", status: "closing" });

  assert.equal(legacy.status, null);
  assert.equal(legacy.statusText, "Legacy");
  assert.equal(isPublicLocation(legacy), true);
  assert.equal(draft.statusText, "Draft");
  assert.equal(isPublicLocation(draft), false);
  assert.equal(isPublicLocation(closed), false);
  assert.equal(isPublicLocation(opening), true);
  assert.equal(isPublicLocation(open), true);
  assert.equal(isPublicLocation(closing), true);
  assert.equal(isPublicLocation(normalizeLocation({ id: "published", is_published: true })), true);
  assert.equal(isPublicLocation(normalizeLocation({ id: "private", status: "open", is_public: false })), false);
  assert.equal(isPublicLocation(normalizeLocation({ id: "not-public", status: "opening", public: false })), false);
  assert.equal(isPublicLocation(normalizeLocation({ id: "unpublished", published: false })), false);
});

test("applies explicit location publication status to generated pages and location lists", async () => {
  const routePage = await readFile(new URL("../src/pages/[...slug].astro", import.meta.url), "utf8");

  assert.match(routePage, /content\.locations\.filter\(isPublicLocation\)/);
  assert.match(routePage, /routePlan\.locationRoutes\.filter\(\(\{ location \}\) => isPublicLocation\(location\)\)/);
  assert.match(routePage, /const locationPages = locationRoutes\.map/);
  assert.match(routePage, /locationRoutes,\s*site: content\.site/);
});
