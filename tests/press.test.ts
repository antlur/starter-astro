import assert from "node:assert/strict";
import test from "node:test";

import { normalizePressRelease, normalizePublicPressReleases } from "../src/lib/backstage/press";

test("normalizes Backstage press fields and rejects unsafe links or media", () => {
  const press = normalizePressRelease({
    id: 42,
    slug: "neighborhood-award",
    title: "A neighborhood award",
    source: "Local Gazette",
    url: "javascript:alert(1)",
    published_at: "2026-09-15T12:00:00Z",
    excerpt: "A short summary.",
    content: "<p>Article details.</p>",
    featured_media: { url: "javascript:alert(1)", alt: "Unsafe image" },
    is_featured: true,
  });

  assert.equal(press.id, "42");
  assert.equal(press.sourceUrl, null);
  assert.equal(press.imageUrl, null);
  assert.equal(press.featured, true);
  assert.equal(press.excerpt, "A short summary.");
  assert.throws(() => normalizePressRelease({ id: 1, title: "Missing date" }), /invalid publication date/);
});

test("only normalizes press records with a canonical public detail route", () => {
  const visible = {
    id: "press-1",
    slug: "community-supper",
    title: "Community Supper",
    source: "Neighborhood Journal",
    published_at: "2026-09-01T00:00:00Z",
  };
  const unlisted = { ...visible, id: "draft-1", slug: "draft-story", title: "Draft story" };

  const releases = normalizePublicPressReleases(
    [visible, unlisted, { id: "malformed-unlisted-record" }],
    ["/", "/press", "/press/community-supper/"],
  );

  assert.deepEqual(releases.map(({ slug }) => slug), ["community-supper"]);
});
