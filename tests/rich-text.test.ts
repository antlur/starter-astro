import assert from "node:assert/strict";
import test from "node:test";
import { richTextToPlainText } from "../src/lib/sanitize-rich-text";

test("converts rich text to safe, readable metadata text", () => {
  assert.equal(richTextToPlainText("<p>Join us &amp; say hello.</p>"), "Join us & say hello.");
});

test("removes script content from metadata text", () => {
  assert.equal(richTextToPlainText("<p>Visit us</p><script>alert('x')</script>"), "Visit us");
});
