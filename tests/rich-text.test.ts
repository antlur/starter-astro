import assert from "node:assert/strict";
import test from "node:test";
import { richTextToPlainText, sanitizeRichText } from "../src/lib/sanitize-rich-text";

test("converts rich text to safe, readable metadata text", () => {
  assert.equal(richTextToPlainText("<p>Join us &amp; say hello.</p>"), "Join us & say hello.");
});

test("removes script content from metadata text", () => {
  assert.equal(richTextToPlainText("<p>Visit us</p><script>alert('x')</script>"), "Visit us");
});

test("normalizes internal rich-text route links and preserves download paths", () => {
  const html = sanitizeRichText('<a href="/menu?source=story#dinner">Menu</a> <a href="/menus/dinner.pdf">PDF</a>');

  assert.match(html, /href="\/menu\/\?source=story#dinner"/);
  assert.match(html, /href="\/menus\/dinner\.pdf"/);
});

test("removes unsupported rich-text hrefs while keeping supported links", () => {
  const html = sanitizeRichText(
    '<a href="//external.example/path">Unsupported</a> '
      + '<a href="javascript:alert(1)">Unsafe</a> '
      + '<a href="https://example.test/menu">External</a> '
      + '<a href="#hours">Hours</a>',
  );

  assert.doesNotMatch(html, /href="\/\//);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /href="https:\/\/example\.test\/menu"/);
  assert.match(html, /href="#hours"/);
});
