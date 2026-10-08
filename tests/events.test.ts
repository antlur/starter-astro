import assert from "node:assert/strict";
import test from "node:test";
import { eventScheduleLabels, normalizeEvent, resolveEventTimezone, resolveUnambiguousEventLocation, selectUpcomingEvents } from "../src/lib/backstage/events";
import { normalizeLocation } from "../src/lib/backstage/locations";

const event = (id: string, startTime: string, endTime: string | null = null) => normalizeEvent({
  id,
  slug: `event-${id}`,
  title: `Event ${id}`,
  start_time: startTime,
  end_time: endTime,
  timezone: "America/Chicago",
  short_description: "An evening together.",
  description: "<p>Details</p>",
  ticket_uri: "https://tickets.example.test/event",
  cover_media: { url: "https://cdn.example.test/event.jpg", alt: "Guests at dinner", width: 1600, height: 900 },
});

test("normalizes event fields and filters unsafe media or ticket URLs", () => {
  const normalized = normalizeEvent({
    id: 42,
    slug: "community-supper",
    title: "Community supper",
    start_time: "2027-04-10T18:00:00-05:00",
    ticket_uri: "javascript:alert(1)",
    cover_media: { url: "javascript:alert(1)", alt: "" },
  });

  assert.equal(normalized.id, "42");
  assert.equal(normalized.imageWidth, undefined);
  assert.equal(normalized.imageHeight, undefined);
  assert.equal(normalized.ticketUrl, null);
  assert.equal(normalized.imageUrl, null);
  assert.throws(() => normalizeEvent({ id: 1, title: "Missing date" }), /invalid event/);
});

test("preserves event media dimensions for stable image layout", () => {
  const normalized = normalizeEvent({
    id: 43,
    slug: "community-supper",
    title: "Community supper",
    start_time: "2027-04-10T18:00:00-05:00",
    cover_media: { url: "https://cdn.example.test/event.jpg", width: 1600, height: 900 },
  });

  assert.equal(normalized.imageWidth, 1600);
  assert.equal(normalized.imageHeight, 900);
});

test("selects future events by start time and caps the requested number", () => {
  const events = [
    event("later", "2027-06-01T18:00:00-05:00"),
    event("past", "2026-01-01T18:00:00-06:00"),
    event("ongoing", "2026-09-30T18:00:00-05:00", "2026-10-02T18:00:00-05:00"),
    event("soon", "2027-01-01T18:00:00-06:00"),
  ];

  assert.deepEqual(selectUpcomingEvents(events, 2, Date.parse("2026-10-01T00:00:00Z")).map(({ id }) => id), ["ongoing", "soon"]);
  assert.equal(selectUpcomingEvents(events, 99, Date.parse("2026-10-01T00:00:00Z")).length, 3);
});

test("formats same-day and multi-day event date and time ranges in the event timezone", () => {
  const multiDay = event("series", "2026-10-03T17:00:00Z", "2026-11-28T17:00:00Z");
  const multiDaySameTime = event("season", "2026-10-04T17:00:00Z", "2027-01-10T18:00:00Z");
  const sameDay = event("one-day", "2026-10-03T17:00:00Z", "2026-10-03T20:00:00Z");

  assert.deepEqual(eventScheduleLabels(multiDay), {
    startDate: "Saturday, October 3, 2026",
    endDate: "Saturday, November 28, 2026",
    startTime: "12:00 PM",
    endTime: "11:00 AM",
  });
  assert.deepEqual(eventScheduleLabels(sameDay), {
    startDate: "Saturday, October 3, 2026",
    endDate: null,
    startTime: "12:00 PM",
    endTime: "3:00 PM",
  });

  assert.deepEqual(eventScheduleLabels(multiDaySameTime), {
    startDate: "Sunday, October 4, 2026",
    endDate: "Sunday, January 10, 2027",
    startTime: "12:00 PM",
    endTime: "12:00 PM",
  });
});

test("uses an event timezone before a shared location timezone and avoids ambiguous inference", () => {
  assert.equal(resolveEventTimezone("America/New_York", ["America/Chicago"]), "America/New_York");
  assert.equal(resolveEventTimezone(null, ["America/Chicago"]), "America/Chicago");
  assert.equal(resolveEventTimezone(null, ["America/Chicago", "America/Chicago"]), "America/Chicago");
  assert.equal(resolveEventTimezone(null, ["America/Chicago", "America/Los_Angeles"]), null);
  assert.equal(resolveEventTimezone(null, ["America/Chicago", null]), null);
  assert.equal(resolveEventTimezone(null, []), null);
});

test("uses an account location for event venue details only when it is unambiguous", () => {
  const first = normalizeLocation({ id: "location-1", name: "Main Street" });
  const second = normalizeLocation({ id: "location-2", name: "Lake Street" });

  assert.equal(resolveUnambiguousEventLocation([]), null);
  assert.equal(resolveUnambiguousEventLocation([first]), first);
  assert.equal(resolveUnambiguousEventLocation([first, second]), null);
});

test("formats missing or invalid event timezones in UTC instead of the process timezone", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    for (const timezone of [null, "Invalid/Timezone"]) {
      const normalized = normalizeEvent({
        id: "utc-fallback",
        slug: "utc-fallback",
        title: "UTC fallback",
        start_time: "2027-04-10T18:00:00Z",
        timezone,
      });

      assert.equal(eventScheduleLabels(normalized).startDate, "Saturday, April 10, 2027");
      assert.equal(eventScheduleLabels(normalized).startTime, "6:00 PM");
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
