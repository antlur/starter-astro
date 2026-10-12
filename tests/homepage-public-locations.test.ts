import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPublicLocation, normalizeLocation } from "../src/lib/backstage/locations";

test("homepage shares only public locations with its layout and location-hours section", async () => {
  const homePage = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
  const legacy = normalizeLocation({ id: "legacy" });
  const published = normalizeLocation({ id: "published", status: "open" });
  const draft = normalizeLocation({ id: "draft", status: "draft" });
  const privateLocation = normalizeLocation({ id: "private", is_public: false });

  assert.deepEqual([legacy, published, draft, privateLocation].filter(isPublicLocation).map(({ id }) => id), [
    "legacy",
    "published",
  ]);
  assert.match(homePage, /const publicLocations = content\.locations\.filter\(isPublicLocation\);/);
  assert.match(homePage, /locations=\{publicLocations\}/);
  assert.match(homePage, /publicLocations\.length > 0 && <LocationHoursSection locations=\{publicLocations\} \/>/);
  assert.doesNotMatch(homePage, /locations=\{content\.locations\}/);
});
