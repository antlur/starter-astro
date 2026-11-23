import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviews, reviewHeading } from "../src/blocks/reviews/reviews";
import { resolveDemoReviews } from "../src/fixtures/demo-reviews";

test("demo review data is off by default and limited to matching explicitly noindex sites", () => {
  assert.deepEqual(resolveDemoReviews(undefined, "true", "api", "restaurant.example"), []);
  for (const indexable of [undefined, "true", "0"]) {
    assert.throws(() => resolveDemoReviews("fat-nickys-demo", indexable, "fixture", null), /SITE_INDEXABLE=false/);
  }
  assert.throws(() => resolveDemoReviews("not-a-demo", "false", "fixture", null), /supported Starter demo/);
  assert.throws(() => resolveDemoReviews("fat-nickys-demo", "false", "api", "franklin-perk.example"), /match the configured demo website/);
  assert.throws(() => resolveDemoReviews("fat-nickys-demo", "false", undefined, "fat-nickys.example"), /match the configured demo website/);

  const nicky = resolveDemoReviews("fat-nickys-demo", "false", "api", "fat-nickys.example");
  const perk = resolveDemoReviews("franklin-perk-demo", "false", "api", "franklin-perk.example");
  assert.deepEqual(new Set(nicky.map((entry) => "location" in entry ? entry.location : undefined)), new Set(["Market Street", "Riverfront"]));
  assert.equal(perk.length, 4);
  assert.notDeepEqual(nicky, perk);
});

test("real quotes require explicit editorial input and never mix with demo fixtures", () => {
  assert.deepEqual(resolveReviews([], undefined), []);
  assert.deepEqual(resolveReviews([], [{ quote: " " }, null, "string", { attribution: "A guest" }]), []);
  const approved = [{ quote: " A great evening. ", attribution: " Guest ", location: " Market Street " }];
  assert.deepEqual(resolveReviews([], approved), [{ quote: "A great evening.", attribution: "Guest", location: "Market Street" }]);
  const demo = resolveDemoReviews("fat-nickys-demo", "false", "fixture", null);
  assert.equal(resolveReviews(demo, approved), demo);
  assert.equal(reviewHeading(" "), "Reviews");
});
