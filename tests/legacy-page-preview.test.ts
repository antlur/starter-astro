import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLegacyPreviewConfiguration,
  collectLegacyPageMediaIds,
  normalizeLegacyPreviewPages,
} from "../src/lib/backstage/legacy-page-preview";

test("adapts the supported legacy PHP block types", () => {
  const pages = normalizeLegacyPreviewPages([{
    id: 1,
    title: "Home",
    slug: "/",
    pathname: "/",
    is_home: true,
    blocks: [
      { id: 1, block: "hero", data: { full_width: true, content: "" } },
      { id: 2, block: "textEditor", data: { content: "<p>Welcome</p>" } },
      { id: 3, block: "imageGrid", data: { title: "Specials", max_columns: "3", media_ids: [] } },
      { id: 4, block: "media_with_text", data: { title: "About", media_on_right: true, full_width: true } },
      { id: 5, block: "events_latest", data: { title: "Events", count: "3" } },
      { id: 6, block: "form", data: { form_id: "form-1", title: "Contact", subtitle: "Say hello" } },
      { id: 7, block: "contactForm", data: { form: { id: "form-2" } } },
    ],
  }]);

  assert.deepEqual(pages[0].blocks.map((block) => block.type), [
    "hero", "rich-text", "image-gallery", "media-with-text", "upcoming-events", "contact-form", "contact-form",
  ]);
  assert.equal(pages[0].blocks[0].variant, "full-bleed-image");
  assert.equal(pages[0].blocks[1].fields.body, "<p>Welcome</p>");
  assert.equal(pages[0].blocks[2].fields.columns, "3");
  assert.equal(pages[0].blocks[3].fields.image_position, "right");
  assert.equal(pages[0].blocks[3].fields.section_width, "full-width");
  assert.equal(pages[0].blocks[4].fields.count, 3);
  assert.equal(pages[0].blocks[5].fields.form_id, "form-1");
  assert.equal(pages[0].blocks[6].fields.form_id, "form-2");
});

test("resolves legacy media IDs and collects only unresolved IDs for lookup", () => {
  const rawPages = [{
    id: "home",
    title: "Home",
    slug: "/",
    pathname: "/",
    blocks: [{ id: "hero", block: "hero", data: { bg_media_id: [{ id: 12 }, { id: 13, url: "https://cdn.example.test/13.jpg" }] } }],
  }];
  const media = { id: 12, url: "https://cdn.example.test/12.jpg", alt: "Front door" };

  assert.deepEqual(collectLegacyPageMediaIds(rawPages), ["12"]);
  const pages = normalizeLegacyPreviewPages(rawPages, new Map([["12", media]]));
  assert.deepEqual(pages[0].blocks[0].fields.image, [media, { id: 13, url: "https://cdn.example.test/13.jpg" }]);
});

test("fails on unsupported legacy block types instead of silently dropping content", () => {
  assert.throws(
    () => normalizeLegacyPreviewPages([{
      id: "page-1", title: "Home", slug: "/", pathname: "/", blocks: [{ id: "block-1", block: "custom_old_block", data: {} }],
    }]),
    /Home|unsupported block "custom_old_block"/,
  );
});

test("legacy preview is API-only and cannot build indexable output", () => {
  assert.equal(assertLegacyPreviewConfiguration("api", "legacy-preview", false), true);
  assert.equal(assertLegacyPreviewConfiguration("api", undefined, true), false);
  assert.throws(() => assertLegacyPreviewConfiguration("fixture", "legacy-preview", false), /requires BACKSTAGE_SOURCE="api"/);
  assert.throws(() => assertLegacyPreviewConfiguration("api", "legacy-preview", true), /cannot be indexable/);
  assert.throws(() => assertLegacyPreviewConfiguration("api", "unknown", false), /Unsupported BACKSTAGE_PAGE_MODE/);
});
