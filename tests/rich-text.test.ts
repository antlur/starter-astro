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

test("preserves Backstage editor images, quotes, underline, and linked buttons safely", () => {
  const html = sanitizeRichText(
    '<p><a class="rich-text-link" href="/contact">Contact</a> '
      + '<a href="/private-events" data-type="button" class="inline-block px-4 py-2 bg-primary">Book now</a></p>'
      + "<blockquote><p>Gather around the table.</p></blockquote>"
      + "<p><u>Made with care.</u></p>"
      + '<img class="max-w-full h-auto rounded" style="max-width: 100%; height: auto;" '
      + 'src="https://media.example.test/editor-image.jpg" alt="Dining room" title="Our dining room" '
      + 'width="640" height="420" alignment="center">',
  );

  assert.match(html, /<a href="\/contact\/">Contact<\/a>/);
  assert.match(html, /<a href="\/private-events\/" class="rich-text__button">Book now<\/a>/);
  assert.match(html, /<blockquote><p>Gather around the table\.<\/p><\/blockquote>/);
  assert.match(html, /<u>Made with care\.<\/u>/);
  assert.match(html, /<img class="rich-text__image" src="https:\/\/media\.example\.test\/editor-image\.jpg" alt="Dining room" title="Our dining room" width="640" height="420" \/>/);
  assert.doesNotMatch(html, /max-w-full|bg-primary|alignment=|style=/);
});

test("drops unsafe editor image URLs and does not preserve arbitrary classes or styles", () => {
  const html = sanitizeRichText(
    '<img src="javascript:alert(1)" class="attacker-class" style="position:fixed" onerror="alert(1)">'
      + '<a href="javascript:alert(1)" data-type="button" class="attacker-class" style="position:fixed">Unsafe</a>'
      + '<script>alert(1)</script>',
  );

  assert.doesNotMatch(html, /javascript:|onerror|attacker-class|position:fixed|<script/i);
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /<a>Unsafe<\/a>/);
});
