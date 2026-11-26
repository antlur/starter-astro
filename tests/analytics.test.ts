import assert from "node:assert/strict";
import { test } from "node:test";
import { GAEvents, GALocations } from "@antlur/backstage/constants/google-events";
import { analyticsLink, googleAnalyticsId } from "../src/lib/analytics";
import { normalizeWebsite } from "../src/lib/backstage/content";

test("uses a GA4 web Measurement ID rather than a property or Tag Manager ID", () => {
  assert.equal(normalizeWebsite({ google_analytics_id: " G-ABCD123456 " }).googleAnalyticsId, "G-ABCD123456");
  for (const value of [undefined, 123456, "123456", "GTM-ABCD", "G-", 'G-ABCD"><script>']) {
    assert.equal(googleAnalyticsId(value), null);
  }
});

test("preserves the legacy action names and reporting dimensions", () => {
  assert.deepEqual(Object.values(GAEvents).sort(), [
    "click_to_call", "click_to_map", "click_to_order", "click_to_social", "click_to_waitlist", "find_location",
  ]);
  assert.deepEqual(analyticsLink(GAEvents.CLICK_TO_MAP, { location: GALocations.LOCATION_CARD, store: "riverfront" }), {
    "data-ga-event": "click_to_map",
    "data-ga-params": '{"location":"location_card","store":"riverfront"}',
  });
  assert.deepEqual(analyticsLink(GAEvents.FIND_LOCATION, { location: GALocations.TOPBAR, store: null }), {
    "data-ga-event": "find_location",
    "data-ga-params": '{"location":"topbar"}',
  });
  assert.deepEqual(analyticsLink("holiday_click", { event_category: "alerts", event_label: "Holiday hours" }), {
    "data-ga-event": "holiday_click",
    "data-ga-params": '{"event_category":"alerts","event_label":"Holiday hours"}',
  });
  assert.deepEqual(analyticsLink("invalid event name"), {});
});
