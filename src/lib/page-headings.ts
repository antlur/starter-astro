import type { HeadlessBlock } from "./backstage/content";

const hasRenderedInstagramPosts = (block: HeadlessBlock): boolean => {
  const count = Number(block.fields.count);
  const postLimit = Number.isFinite(count) && count > 0
    ? Math.min(Math.floor(count), 12)
    : 6;

  return (block.instagramPosts ?? []).slice(0, postLimit).length > 0;
};

export const primaryHeadingIndex = (blocks: HeadlessBlock[]): number =>
  blocks.findIndex((block) => {
    if (block.type === "instagram-feed" && !hasRenderedInstagramPosts(block)) return false;

    const heading = block.fields.heading;
    if (typeof heading === "string" && heading.trim() !== "") return true;

    return block.type === "rich-text"
      && typeof block.fields.body === "string"
      && /<h1(?:\s|>)/i.test(block.fields.body);
  });
