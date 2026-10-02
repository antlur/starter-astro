import assert from "node:assert/strict";
import test from "node:test";
import { eventScheduleLabels, normalizeEvent, selectUpcomingEvents } from "../src/lib/backstage/events";

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
  cover_media: { url: "https://cdn.example.test/event.jpg", alt: "Guests at dinner" },
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
  assert.equal(normalized.ticketUrl, null);
  assert.equal(normalized.imageUrl, null);
  assert.throws(() => normalizeEvent({ id: 1, title: "Missing date" }), /invalid event/);
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
