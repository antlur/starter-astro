import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocation } from "../src/lib/backstage/locations";

test("preserves a Backstage location timezone", () => {
  const location = normalizeLocation({ name: "Main Street", timezone: "America/Chicago" });

  assert.equal(location.timezone, "America/Chicago");
});
