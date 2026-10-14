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

test("skips an empty Instagram Feed when selecting the primary heading", () => {
  assert.equal(primaryHeadingIndex([
    {
      ...block("instagram-feed", { heading: "Follow along" }),
      instagramPosts: [],
    },
    block("hero", { heading: "Welcome" }),
  ]), 1);
});

test("allows a populated Instagram Feed to own the primary heading", () => {
  assert.equal(primaryHeadingIndex([
    {
      ...block("instagram-feed", { heading: "Follow along" }),
      instagramPosts: [{
        id: "post-1",
        imageUrl: "https://example.com/post.jpg",
        caption: "",
        permalink: "https://instagram.com/p/post-1",
        timestamp: null,
        mediaType: "IMAGE",
      }],
    },
    block("hero", { heading: "Welcome" }),
  ]), 0);
});

test("skips headings from blocks that do not render visible content", () => {
  assert.equal(primaryHeadingIndex([
    block("image-gallery", { heading: "Empty gallery", images: [] }),
    block("image-link-grid", {
      heading: "Empty links",
      items: [{ image: { url: "javascript:alert(1)" }, link_url: "/about", link_label: "Unsafe image" }],
    }),
    block("rich-text", { body: "<h1> </h1>" }),
    block("image", { heading: "Not rendered by this block" }),
    block("hero", { heading: "Visible heading" }),
  ]), 4);
});

test("uses the upcoming-events title that its renderer actually displays", () => {
  assert.equal(primaryHeadingIndex([
    block("upcoming-events", { title: "Community Events" }),
    block("hero", { heading: "Welcome" }),
  ]), 0);
});

test("allows a populated image gallery heading to be primary", () => {
  assert.equal(primaryHeadingIndex([
    block("image-gallery", {
      heading: "Dining room",
      images: [{ image: { url: "https://example.com/dining-room.jpg" } }],
    }),
    block("hero", { heading: "Welcome" }),
  ]), 0);
});

test("skips an Instagram Feed when its configured post count renders no posts", () => {
  assert.equal(primaryHeadingIndex([
    {
      ...block("instagram-feed", { heading: "Follow along", count: 0.5 }),
      instagramPosts: [{
        id: "post-1",
        imageUrl: "https://example.com/post.jpg",
        caption: "",
        permalink: "https://instagram.com/p/post-1",
        timestamp: null,
        mediaType: "IMAGE",
      }],
    },
    block("hero", { heading: "Welcome" }),
  ]), 1);
});

test("returns no primary block heading when the page has no heading content", () => {
  assert.equal(primaryHeadingIndex([block("rich-text", { body: "<p>Content</p>" })]), -1);
});
