import assert from "node:assert/strict";
import test from "node:test";
import type { Alert } from "@antlur/backstage";
import { alertsForPath } from "../src/lib/backstage/alerts";

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: "alert-1",
  title: "Notice",
  type: "info",
  is_global: false,
  published: true,
  pages: [],
  target_mode: "selected",
  targets: [{ type: "path", value: "/about", label: "About", path: "/about/", resolved: true }],
  start_at: null,
  end_at: null,
  media: null,
  content: "<p>Notice content</p>",
  cta_label: null,
  cta_url: null,
  analytics_name: null,
  analytics_category: null,
  analytics_label: null,
  position: "top",
  ...overrides,
});

test("matches selected alerts against normalized CMS and explicit route paths", () => {
  const targeted = makeAlert();
  const global = makeAlert({ id: "global", is_global: true, targets: [] });
  const otherPage = makeAlert({ id: "other", targets: [{ type: "path", value: "/menu", label: "Menu", path: "/menu/", resolved: true }] });

  assert.deepEqual(alertsForPath([targeted, global, otherPage], "/about", Date.parse("2026-10-03T12:00:00Z")), [targeted, global]);
  assert.deepEqual(alertsForPath([targeted, global, otherPage], "/menu/", Date.parse("2026-10-03T12:00:00Z")), [global, otherPage]);
});

test("honors publication and scheduled visibility", () => {
  const scheduled = makeAlert({
    start_at: "2026-10-04T00:00:00Z",
    end_at: "2026-10-05T00:00:00Z",
  });

  assert.deepEqual(alertsForPath([scheduled], "/about", Date.parse("2026-10-03T23:59:59Z")), []);
  assert.deepEqual(alertsForPath([scheduled], "/about", Date.parse("2026-10-04T12:00:00Z")), [scheduled]);
  assert.deepEqual(alertsForPath([scheduled], "/about", Date.parse("2026-10-05T00:00:01Z")), []);
  assert.deepEqual(alertsForPath([makeAlert({ published: false })], "/about", Date.now()), []);
});
