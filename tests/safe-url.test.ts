import assert from "node:assert/strict";
import test from "node:test";
import { mediaAltText, previewRouteUrl, safeAltText, safeImageUrl, safeLinkUrl } from "../src/lib/safe-url";

test("safe block URLs allow local and supported links but reject unsafe schemes", () => {
  assert.equal(safeLinkUrl("/about/"), "/about/");
  assert.equal(safeLinkUrl("#contact"), "#contact");
  assert.equal(safeLinkUrl("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(safeLinkUrl("javascript:alert(1)"), null);
  assert.equal(safeLinkUrl("//example.com"), null);
  assert.equal(safeLinkUrl("/\\\\evil.example/path"), null);
  assert.equal(safeImageUrl("/\\\\evil.example/photo.jpg"), null);
  assert.equal(safeImageUrl({ url: "https://example.com/photo.jpg", alt: "A photo" }), "https://example.com/photo.jpg");
  assert.equal(safeImageUrl("data:image/svg+xml,<svg></svg>"), null);
  assert.equal(mediaAltText({ url: "/photo.jpg", alt: "A photo" }), "A photo");
  assert.equal(mediaAltText({ url: "/photo.jpg", alt: "family-at-the-game.jpg" }), "");
  assert.equal(safeAltText("community-page-picture.png"), "");
  assert.equal(safeAltText("People celebrating a win"), "People celebrating a win");
});

test("preview route URLs localize only known paths on the configured website domain", () => {
  const routes = ["/", "/menu/", "/events/football/", "/catering/catering-inquiry/"];

  assert.equal(previewRouteUrl("https://www.goallinebar.com/menu?source=home#lunch", "goallinebar.com", routes), "/menu/?source=home#lunch");
  assert.equal(previewRouteUrl("https://goallinebar.com/catering-inquiry", "goallinebar.com", routes), "/catering/catering-inquiry/");
  assert.equal(previewRouteUrl("https://order.goallinebar.com/menu/", "goallinebar.com", routes), null);
  assert.equal(previewRouteUrl("https://goallinebar.com/missing/", "goallinebar.com", routes), null);
  assert.equal(previewRouteUrl("https://goallinebar.com/football/", "goallinebar.com", ["/events/football/", "/league/football/"]), null);
  assert.equal(previewRouteUrl("https://example.test/menu/", "goallinebar.com", routes), null);
  assert.equal(previewRouteUrl("javascript:alert(1)", "goallinebar.com", routes), null);
});
