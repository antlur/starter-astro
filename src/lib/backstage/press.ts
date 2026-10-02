import { mediaAltText, safeImageUrl } from "../safe-url";

export interface SitePressRelease {
  id: string;
  slug: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  excerpt: string | null;
  content: string | null;
  imageUrl: string | null;
  imageAlt: string;
  featured: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string): string => {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error(`Backstage press item has an invalid ${label}.`);
  }

  return String(value).trim();
};

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const safeSourceUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

export const normalizePressRelease = (value: unknown, index = 0): SitePressRelease => {
  if (!isRecord(value)) throw new Error(`Backstage returned an invalid press item at index ${index}.`);

  const publishedAt = requiredString(value.published_at, "publication date");
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new Error(`Backstage press item ${String(value.id)} has an invalid publication date.`);
  }

  const featuredMedia = isRecord(value.featured_media) ? value.featured_media : null;

  return {
    id: requiredString(value.id, "ID"),
    slug: requiredString(value.slug, "slug"),
    title: requiredString(value.title, "title"),
    source: requiredString(value.source, "source"),
    sourceUrl: safeSourceUrl(value.url),
    publishedAt,
    excerpt: optionalString(value.excerpt),
    content: optionalString(value.content),
    imageUrl: safeImageUrl(featuredMedia),
    imageAlt: mediaAltText(featuredMedia),
    featured: value.is_featured === true,
  };
};

export const normalizePublicPressReleases = (
  values: unknown[],
  routePaths: string[],
): SitePressRelease[] => {
  const publicSlugs = new Set(routePaths.flatMap((path) => {
    const match = /^\/press\/([^/]+)\/?$/.exec(path);
    if (!match) return [];

    try {
      return [decodeURIComponent(match[1])];
    } catch {
      return [];
    }
  }));

  return values.flatMap((item, index) =>
    isRecord(item) && typeof item.slug === "string" && publicSlugs.has(item.slug)
      ? [normalizePressRelease(item, index)]
      : [],
  );
};
