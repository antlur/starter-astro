import { safeImageUrl, safeLinkUrl } from "../safe-url";

export interface SiteInstagramPost {
  id: string;
  imageUrl: string;
  caption: string;
  permalink: string;
  timestamp: string | null;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const normalizeInstagramPosts = (value: unknown, limit = 12): SiteInstagramPost[] => {
  if (!Array.isArray(value)) throw new Error("Backstage did not return an Instagram posts collection.");

  return value.flatMap((candidate): SiteInstagramPost[] => {
    if (!isRecord(candidate)) return [];

    const id = typeof candidate.id === "number" ? String(candidate.id) : optionalText(candidate.id);
    const permalink = safeLinkUrl(candidate.permalink);
    const imageUrl = safeImageUrl(candidate.thumbnail_url) ?? safeImageUrl(candidate.media_url);
    const mediaType = candidate.media_type;

    if (
      !id
      || !permalink?.startsWith("https://")
      || !imageUrl
      || !["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(String(mediaType))
    ) return [];

    const caption = (optionalText(candidate.caption) ?? "").replace(/\s+/g, " ").slice(0, 180);
    const timestamp = optionalText(candidate.timestamp);

    return [{
      id,
      imageUrl,
      caption,
      permalink,
      timestamp: timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null,
      mediaType: mediaType as SiteInstagramPost["mediaType"],
    }];
  }).slice(0, Math.max(0, Math.min(Math.floor(limit), 12)));
};
