import type { HeadlessBlock } from "./backstage/content";
import { richTextToPlainText, sanitizeRichText } from "./sanitize-rich-text";
import { safeImageUrl, safeSiteLinkUrl, safeVideoUrl } from "./safe-url";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

const hasRenderedImageGalleryImages = (block: HeadlessBlock): boolean =>
  Array.isArray(block.fields.images) && block.fields.images.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

    return Boolean(safeImageUrl((value as Record<string, unknown>).image));
  });

const hasRenderedImageLinkItems = (block: HeadlessBlock): boolean =>
  Array.isArray(block.fields.items) && block.fields.items.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

    const item = value as Record<string, unknown>;
    return Boolean(safeImageUrl(item.image) && safeSiteLinkUrl(item.link_url) && text(item.link_label));
  });

const hasRenderedInstagramPosts = (block: HeadlessBlock): boolean => {
  const count = Number(block.fields.count);
  const postLimit = Number.isFinite(count) && count > 0
    ? Math.min(Math.floor(count), 12)
    : 6;

  return (block.instagramPosts ?? []).slice(0, postLimit).length > 0;
};

const headingText = (block: HeadlessBlock): string => {
  if (block.type === "upcoming-events") return text(block.fields.title);
  if (block.type === "contact-form") return text(block.fields.heading) || text(block.form?.title);

  return [
    "hero",
    "call-to-action",
    "card-grid",
    "image-gallery",
    "image-link-grid",
    "instagram-feed",
    "media-with-text",
    "rich-text",
    "video-hero",
  ].includes(block.type)
    ? text(block.fields.heading)
    : "";
};

const hasRenderedHeading = (block: HeadlessBlock): boolean => {
  if (block.type === "image-gallery" && !hasRenderedImageGalleryImages(block)) return false;
  if (block.type === "image-link-grid" && !hasRenderedImageLinkItems(block)) return false;
  if (block.type === "instagram-feed" && !hasRenderedInstagramPosts(block)) return false;
  if (block.type === "video-hero" && !safeVideoUrl(block.fields.video)) return false;

  const heading = headingText(block);
  if (heading) return true;

  if (block.type !== "rich-text") return false;

  const body = text(block.fields.body);
  if (!body) return false;

  const sanitized = sanitizeRichText(body, undefined, { preserveFirstH1: true });
  const firstH1 = sanitized.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i);

  return Boolean(firstH1 && richTextToPlainText(firstH1[1] ?? ""));
};

export const primaryHeadingIndex = (blocks: HeadlessBlock[]): number =>
  blocks.findIndex(hasRenderedHeading);
