import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPublicLocation, locationSchemaUrl, locationStructuredData, normalizeLocation } from "../src/lib/backstage/locations";

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
  assert.deepEqual(location.postalAddress, {
    streetAddress: "9700 Franklin Ave",
    addressLocality: "Franklin Park",
    addressRegion: "IL",
    postalCode: "60131",
  });
  assert.deepEqual(location.hours.map(({ day, value }) => ({ day, value })), [
    { day: "Mon-Thu", value: "10 AM - 11 PM" },
    { day: "Fri", value: "10 AM - 12 AM" },
    { day: "Sat", value: "11 AM - 12 AM" },
    { day: "Sun", value: "11 AM - 10 PM" },
  ]);
  assert.equal(location.mapUrl, "https://maps.example.test/restaurant");
  assert.equal(location.imageWidth, 1600);
  assert.equal(location.imageHeight, 1000);
  assert.deepEqual(location.openingHoursSpecification, [
    ...["Monday", "Tuesday", "Wednesday", "Thursday"].map((dayOfWeek) => ({
      dayOfWeek: `https://schema.org/${dayOfWeek}`,
      opens: "10:00",
      closes: "23:00",
    })),
    { dayOfWeek: "https://schema.org/Friday", opens: "10:00", closes: "00:00" },
    { dayOfWeek: "https://schema.org/Saturday", opens: "11:00", closes: "00:00" },
    { dayOfWeek: "https://schema.org/Sunday", opens: "11:00", closes: "22:00" },
  ]);
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
  assert.deepEqual(location.openingHoursSpecification, [
    { dayOfWeek: "https://schema.org/Monday", opens: "00:00", closes: "00:00" },
    { dayOfWeek: "https://schema.org/Tuesday", opens: "00:00", closes: "23:59" },
  ]);
  assert.deepEqual(location.hourGroups, [{ label: null, hours: location.hours }]);
});

test("preserves ordered provider links by service and discards duplicates and unsafe entries", () => {
  const location = normalizeLocation({
    ordering_links: [
      { service: " Toast ", url: " HTTPS://ORDER.example.test:443/menu?location=north#pickup " },
      { service: "Toast", url: "https://order.example.test/menu?location=north#pickup" },
      { service: "other", url: "http://order.example.test/direct" },
      { service: "Toast", url: "https://order.example.test/south" },
      null,
      { service: "", url: "https://order.example.test" },
      { url: "https://order.example.test" },
      ...[
        "javascript:alert(1)",
        "mailto:order@example.test",
        "ftp://order.example.test",
        "//order.example.test/menu",
        "/order",
        "https:order.example.test",
        "https:///order.example.test",
        "https://",
        "https://order.example.test:bad",
        "https://alice@order.example.test",
        "https://alice:secret@order.example.test",
        "https://@order.example.test",
      ].map((url) => ({ service: "other", url })),
    ],
    delivery_links: [{ service: "DoorDash", url: "https://delivery.example.test/store" }],
    reservation_links: [{ service: "OpenTable", url: "https://reserve.example.test/book" }],
    waitlist_links: [{ service: "Yelp", url: "https://wait.example.test/join" }],
  });

  assert.deepEqual(location.providerLinks, {
    ordering: [
      { service: "Toast", url: "https://order.example.test/menu?location=north#pickup" },
      { service: "other", url: "http://order.example.test/direct" },
      { service: "Toast", url: "https://order.example.test/south" },
    ],
    delivery: [{ service: "DoorDash", url: "https://delivery.example.test/store" }],
    reservation: [{ service: "OpenTable", url: "https://reserve.example.test/book" }],
    waitlist: [{ service: "Yelp", url: "https://wait.example.test/join" }],
  });
  assert.deepEqual(normalizeLocation({
    ordering_links: null,
    delivery_links: { service: "other", url: "https://delivery.example.test/store" },
    reservation_links: [{ service: "other", url: false }],
  }).providerLinks, {});
});

test("normalizes dated exceptions with titles and notes without filtering by the current date", () => {
  const location = normalizeLocation({
    timezone: "Pacific/Honolulu",
    special_hours: [
      { date: "2000-12-25", title: " Christmas ", closed24Hours: true, notes: " Private event " },
      { date: "2096-02-29", title: null, openTime: "9:00:00", closeTime: "16:30", notes: "Bar closes early" },
      { date: "2096-03-01", title: "Overnight event", open24Hours: true, notes: "Lobby only" },
      { date: "2097-02-29", closed24Hours: true },
      { date: "2096-03-02", openTime: "bad", closeTime: "16:00" },
      { date: "2096-03-03", openTime: "09:00" },
      { date: "2096-03-04", hidden: true, closed24Hours: true },
      { date: "03/05/2096", closed24Hours: true },
      null,
    ],
  });

  assert.deepEqual(location.specialHours, [
    { date: "2000-12-25", label: "Christmas", value: "Closed (Private event)" },
    { date: "2096-02-29", label: "Special hours", value: "9 AM - 4:30 PM (Bar closes early)" },
    { date: "2096-03-01", label: "Overnight event", value: "Open 24 hours (Lobby only)" },
  ]);
  assert.deepEqual(location.hours, []);
  assert.deepEqual(location.openingHoursSpecification, []);
  assert.deepEqual(normalizeLocation({ special_hours: null }).specialHours, []);
});

test("keeps named Backstage hour groups separate without changing flat hours", () => {
  const location = normalizeLocation({
    hours: [
      { label: null, days: [{ day: "Friday", closed24Hours: true }] },
      { label: " Kitchen ", days: [
        { day: "Tuesday", openTime: "11:00", closeTime: "21:00" },
        { day: "Monday", openTime: "11:00", closeTime: "21:00" },
        { day: "Thursday", hidden: true, openTime: "11:00", closeTime: "21:00" },
      ] },
      { label: "Patio", days: [{ day: "Wednesday", openTime: "11:00", closeTime: "21:00" }] },
      { label: "Empty", days: [null, { day: "Funday", closed24Hours: true }] },
      null,
    ],
  });

  assert.deepEqual(location.hourGroups, [
    { label: null, hours: [{ day: "Fri", value: "Closed", order: 4 }] },
    { label: "Kitchen", hours: [{ day: "Mon-Tue", value: "11 AM - 9 PM", order: 1 }] },
    { label: "Patio", hours: [{ day: "Wed", value: "11 AM - 9 PM", order: 2 }] },
  ]);
  assert.deepEqual(location.hours, [
    { day: "Mon-Wed", value: "11 AM - 9 PM", order: 2 },
    { day: "Fri", value: "Closed", order: 4 },
  ]);
});

test("normalizes legacy opening hours and omits invalid or incomplete schedule rows", () => {
  const location = normalizeLocation({
    id: "legacy-hours",
    hours: [
      { day: "Mon", open_time: "9:00:00", close_time: "17:30" },
      { day: "Tuesday", openTime: "bad", closeTime: "18:00" },
      { day: "Funday", openTime: "09:00", closeTime: "17:00" },
      { day: "Wednesday", hidden: true, openTime: "09:00", closeTime: "17:00" },
      { day: "Thursday", openTime: "09:00", closeTime: "09:00" },
    ],
  });

  assert.deepEqual(location.openingHoursSpecification, [
    { dayOfWeek: "https://schema.org/Monday", opens: "09:00", closes: "17:30" },
  ]);
  assert.equal(location.postalAddress, null);
});

test("builds LocalBusiness JSON-LD with structured address and regular hours only", () => {
  const location = normalizeLocation({
    name: "Franklin Ave",
    address: "9700 Franklin Ave",
    address2: "Suite 2",
    city: "Franklin Park",
    state: "IL",
    zip: "60131",
    hours: [{ day: "Monday", openTime: "10:00", closeTime: "22:00" }],
  });
  const schema = locationStructuredData(location, "https://example.test/locations/franklin/");

  assert.equal(schema["@type"], "LocalBusiness");
  assert.equal(schema.url, "https://example.test/locations/franklin/");
  assert.deepEqual(schema.address, {
    "@type": "PostalAddress",
    streetAddress: "9700 Franklin Ave, Suite 2",
    addressLocality: "Franklin Park",
    addressRegion: "IL",
    postalCode: "60131",
  });
  assert.deepEqual(schema.openingHoursSpecification, [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: "https://schema.org/Monday",
    opens: "10:00",
    closes: "22:00",
  }]);

  const minimalSchema = locationStructuredData(normalizeLocation({ name: "Remote shop" }));
  const serializedMinimalSchema = JSON.stringify(minimalSchema);
  assert.doesNotMatch(serializedMinimalSchema, /"address"/);
  assert.doesNotMatch(serializedMinimalSchema, /"openingHoursSpecification"/);
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
