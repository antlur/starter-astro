import assert from "node:assert/strict";
import test from "node:test";

import { assertApplicationRoutesEmitted } from "../scripts/assert-application-routes.mjs";

test("accepts declared Astro routes present in built HTML output", () => {
  assert.doesNotThrow(() => assertApplicationRoutesEmitted(
    ["/", "/private-events", "/faq/"],
    ["index.html", "private-events/index.html", "faq/index.html"],
  ));
});

test("reports declared Astro routes missing from built HTML output", () => {
  assert.throws(
    () => assertApplicationRoutesEmitted(["/private-events"], ["index.html"]),
    /Built output omitted declared Astro-owned routes: \/private-events\//,
  );
});
