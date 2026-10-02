import type { HeadlessBlock } from "./backstage/content";

export const primaryHeadingIndex = (blocks: HeadlessBlock[]): number =>
  blocks.findIndex((block) => {
    const heading = block.fields.heading;
    if (typeof heading === "string" && heading.trim() !== "") return true;

    return block.type === "rich-text"
      && typeof block.fields.body === "string"
      && /<h1(?:\s|>)/i.test(block.fields.body);
  });
