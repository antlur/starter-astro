import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInstagramPosts } from "../src/lib/backstage/instagram";

test("normalizes public Instagram image and video posts safely", () => {
  const posts = normalizeInstagramPosts([
    { id: 1, media_type: "IMAGE", media_url: "https://cdn.example.test/1.jpg", permalink: "https://instagram.com/p/1", caption: "  Hello\nthere ", timestamp: "2026-10-01T10:00:00Z" },
    { id: 2, media_type: "VIDEO", media_url: "https://cdn.example.test/2.mp4", thumbnail_url: "https://cdn.example.test/2.jpg", permalink: "https://instagram.com/p/2" },
    { id: 3, media_type: "IMAGE", media_url: "javascript:alert(1)", permalink: "https://instagram.com/p/3" },
    { id: 4, media_type: "IMAGE", media_url: "https://cdn.example.test/4.jpg", permalink: "javascript:alert(1)" },
  ]);

  assert.deepEqual(posts, [
    {
      id: "1",
      imageUrl: "https://cdn.example.test/1.jpg",
      caption: "Hello there",
      permalink: "https://instagram.com/p/1",
      timestamp: "2026-10-01T10:00:00Z",
      mediaType: "IMAGE",
    },
    {
      id: "2",
      imageUrl: "https://cdn.example.test/2.jpg",
      caption: "",
      permalink: "https://instagram.com/p/2",
      timestamp: null,
      mediaType: "VIDEO",
    },
  ]);
});

test("caps the Instagram feed to twelve posts", () => {
  const posts = Array.from({ length: 16 }, (_, id) => ({
    id,
    media_type: "IMAGE",
    media_url: `https://cdn.example.test/${id}.jpg`,
    permalink: `https://instagram.com/p/${id}`,
  }));

  assert.equal(normalizeInstagramPosts(posts, 50).length, 12);
});
