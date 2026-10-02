import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocation } from "../src/lib/backstage/locations";

test("normalizes grouped Backstage hours and collapses adjacent matching days", () => {
  const location = normalizeLocation({
    id: "location-1",
    name: "Franklin Ave",
    address: "9700 Franklin Ave",
    city: "Franklin Park",
    state: "IL",
    zip: "60131",
    phone: "(847) 349-9325",
    map_link: "https://maps.example.test/goal-line",
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
  assert.equal(location.mapUrl, "https://maps.example.test/goal-line");
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
