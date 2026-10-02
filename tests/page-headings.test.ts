import assert from "node:assert/strict";
import test from "node:test";
import type { HeadlessBlock } from "../src/lib/backstage/content";
import { primaryHeadingIndex } from "../src/lib/page-headings";

const block = (type: string, fields: Record<string, unknown>): HeadlessBlock => ({
  id: type,
  type,
  fields,
});

test("uses the first rich-text h1 as primary before later block headings", () => {
  assert.equal(primaryHeadingIndex([
    block("rich-text", { body: '<h1>Welcome</h1>' }),
    block("image-gallery", { heading: "Daily specials" }),
  ]), 0);
});

test("uses the first configured block heading when it comes first", () => {
  assert.equal(primaryHeadingIndex([
    block("hero", { heading: "Welcome" }),
    block("rich-text", { body: '<h1>More information</h1>' }),
  ]), 0);
});

test("returns no primary block heading when the page has no heading content", () => {
  assert.equal(primaryHeadingIndex([block("rich-text", { body: "<p>Content</p>" })]), -1);
});
