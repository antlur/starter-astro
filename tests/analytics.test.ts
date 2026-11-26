import assert from "node:assert/strict";
import { test } from "node:test";
import { GAEvents, GALocations } from "@antlur/backstage/constants/google-events";
import { analyticsLink, googleAnalyticsId, providerEventsByUrl, serviceAnalytics } from "../src/lib/analytics";
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

test("configured direct provider URLs retain action, location, and fulfillment without guessing", () => {
  const reserve = { service: "Resy", url: "https://reserve.example/market-street" };
  const pickup = { service: "Order", url: "https://order.example/market-street" };
  const delivery = { service: "Delivery", url: "https://delivery.example/market-street" };
  const shared = { service: "Order", url: "https://order.example/all" };
  const ambiguous = { service: "Both", url: "https://action.example/" };
  const events = providerEventsByUrl([
    { slug: "market-street", providerLinks: { reservation: [reserve, ambiguous], ordering: [pickup, shared], delivery: [delivery] } },
    { slug: "riverfront", providerLinks: { delivery: [shared], ordering: [ambiguous] } },
  ]);

  assert.deepEqual(events[reserve.url], { ...serviceAnalytics.reservation, store: "market-street", order_type: undefined });
  assert.equal(events[reserve.url].name, "click_to_reserve");
  assert.equal(events[pickup.url].order_type, "pickup");
  assert.equal(events[delivery.url].order_type, "delivery");
  assert.deepEqual(events[shared.url], { name: "click_to_order", store: undefined, order_type: undefined });
  assert.equal(events[ambiguous.url], undefined);
  assert.equal(events["/reservations/"], undefined);
});
