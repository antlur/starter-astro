import assert from "node:assert/strict";
import test from "node:test";

import { normalizePressRelease, normalizePublicPressReleases, selectFeaturedPress, selectRecentPress } from "../src/lib/backstage/press";

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

  assert.deepEqual(releases.map(({ slug, publicPath }) => [slug, publicPath]), [
    ["community-supper", "/press/community-supper/"],
  ]);
});

test("preserves press image dimensions for stable image layout", () => {
  const press = normalizePressRelease({
    id: 43,
    slug: "neighborhood-award",
    title: "A neighborhood award",
    source: "Local Gazette",
    published_at: "2026-09-15T12:00:00Z",
    featured_media: { url: "https://cdn.example.test/press.jpg", alt: "Award", width: 1200, height: 900 },
  });

  assert.equal(press.imageWidth, 1200);
  assert.equal(press.imageHeight, 900);
});

test("selects featured and recent press only from published canonical records", () => {
  const now = Date.parse("2026-09-20T00:00:00Z");
  const releaseFor = (id: string, publishedAt: string, featured: boolean, publicPath: string | null) => ({
    ...normalizePressRelease({
      id,
      slug: id,
      title: `Release ${id}`,
      source: "Neighborhood Journal",
      published_at: publishedAt,
      is_featured: featured,
    }),
    publicPath,
  });
  const releases = [
    releaseFor("latest", "2026-09-18T00:00:00Z", true, "/press/latest/"),
    releaseFor("older", "2026-09-10T00:00:00Z", true, "/press/older/"),
    releaseFor("unfeatured", "2026-09-19T00:00:00Z", false, "/press/unfeatured/"),
    releaseFor("future", "2026-09-25T00:00:00Z", true, "/press/future/"),
    releaseFor("unlisted", "2026-09-20T00:00:00Z", true, null),
  ];

  assert.equal(selectFeaturedPress(releases, now)?.id, "latest");
  assert.deepEqual(selectRecentPress(releases, 3, now).map(({ id }) => id), ["unfeatured", "latest", "older"]);
  assert.deepEqual(selectRecentPress(releases, "1", now).map(({ id }) => id), ["unfeatured"]);
});
