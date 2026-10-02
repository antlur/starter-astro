import { safeAltText } from "../safe-url";

type RecordValue = Record<string, unknown>;

export interface LegacyPreviewBlock {
  id: string;
  type: string;
  variant?: string | null;
  fields: RecordValue;
}

export interface LegacyPreviewPage {
  id: string;
  title: string;
  slug: string;
  pathname: string;
  is_home: boolean;
  settings: RecordValue | null;
  layout: null;
  meta: RecordValue | null;
  blocks: LegacyPreviewBlock[];
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const mediaKey = (value: unknown): string | null => {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
};

const isEnabled = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const resolveMedia = (value: unknown, mediaById: ReadonlyMap<string, unknown>): unknown => {
  if (Array.isArray(value)) return value.map((item) => resolveMedia(item, mediaById)).filter(Boolean);
  if (isRecord(value)) {
    if (typeof value.url === "string") return value;
    const id = mediaKey(value.id);
    return id ? mediaById.get(id) ?? null : null;
  }

  const id = mediaKey(value);
  return id ? mediaById.get(id) ?? null : value;
};

const firstMedia = (value: unknown, mediaById: ReadonlyMap<string, unknown>): unknown => {
  const resolved = resolveMedia(value, mediaById);
  return Array.isArray(resolved) ? resolved[0] ?? null : resolved;
};

const mapLegacyBlock = (
  value: unknown,
  pagePath: string,
  index: number,
  mediaById: ReadonlyMap<string, unknown>,
): LegacyPreviewBlock => {
  if (!isRecord(value) || (typeof value.id !== "string" && typeof value.id !== "number")) {
    throw new Error(`Legacy page ${pagePath} has an invalid block at index ${index}.`);
  }

  const type = text(value.block);
  const data = isRecord(value.data) ? value.data : {};
  const id = String(value.id);

  switch (type) {
    case "hero":
      return {
        id,
        type: "hero",
        variant: isEnabled(data.full_width) ? "full-bleed-image" : null,
        fields: {
          heading: "",
          body: text(data.content),
          image: resolveMedia(data.bg_media_id, mediaById),
          logo: firstMedia(data.logo_media_id, mediaById),
        },
      };
    case "textEditor":
      return { id, type: "rich-text", fields: { body: text(data.content) } };
    case "imageGrid": {
      const rawColumns = Number(data.max_columns);
      const columns = [2, 3, 4].includes(rawColumns) ? String(rawColumns) : "3";
      const images = resolveMedia(data.media_ids, mediaById);
      return {
        id,
        type: "image-gallery",
        fields: {
          heading: text(data.title),
          columns,
          images: Array.isArray(images)
            ? images.map((image) => ({
                image,
                imageAlt: isRecord(image) ? safeAltText(image.alt) : "",
                caption: "",
              }))
            : [],
        },
      };
    }
    case "media_with_text": {
      const image = firstMedia(data.media, mediaById);
      return {
        id,
        type: "media-with-text",
        fields: {
          heading: text(data.title),
          subheading: text(data.subtitle),
          body: text(data.content),
          image,
          imageAlt: isRecord(image) ? safeAltText(image.alt) : "",
          image_position: isEnabled(data.media_on_right) ? "right" : "left",
          section_width: isEnabled(data.full_width) ? "full-width" : "standard",
          cta_label: text(data.cta_label),
          cta_url: text(data.cta_url),
        },
      };
    }
    case "events_latest": {
      const count = Number(data.count);
      return {
        id,
        type: "upcoming-events",
        fields: {
          title: text(data.title),
          ...(Number.isFinite(count) && count > 0 ? { count } : {}),
        },
      };
    }
    case "form":
    case "contactForm": {
      const form = isRecord(data.form) ? data.form : {};
      return {
        id,
        type: "contact-form",
        fields: {
          heading: text(data.title),
          body: text(data.subtitle),
          form_id: text(data.form_id) || text(form.id),
        },
      };
    }
    default:
      throw new Error(`Legacy page ${pagePath} uses unsupported block "${type || "unknown"}" at index ${index}.`);
  }
};

const collectMediaIds = (value: unknown, ids: Set<string>): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaIds(item, ids));
    return;
  }

  if (isRecord(value)) {
    if (typeof value.url === "string") return;
    const id = mediaKey(value.id);
    if (id) ids.add(id);
    return;
  }

  const id = mediaKey(value);
  if (id) ids.add(id);
};

export const collectLegacyPageMediaIds = (pages: unknown[]): string[] => {
  const ids = new Set<string>();

  for (const page of pages) {
    if (!isRecord(page) || !Array.isArray(page.blocks)) continue;
    for (const block of page.blocks) {
      if (!isRecord(block) || !isRecord(block.data)) continue;
      for (const key of ["bg_media_id", "logo_media_id", "media", "media_ids"]) {
        collectMediaIds(block.data[key], ids);
      }
    }
  }

  return [...ids];
};

export const normalizeLegacyPreviewPages = (
  pages: unknown[],
  mediaById: ReadonlyMap<string, unknown> = new Map(),
): LegacyPreviewPage[] => pages.map((value, pageIndex) => {
  if (
    !isRecord(value)
    || (typeof value.id !== "string" && typeof value.id !== "number")
    || typeof value.title !== "string"
    || typeof value.slug !== "string"
    || typeof value.pathname !== "string"
    || !Array.isArray(value.blocks)
  ) {
    throw new Error(`Backstage returned an invalid legacy page at index ${pageIndex}.`);
  }

  const pagePath = value.pathname as string;
  return {
    id: String(value.id),
    title: value.title,
    slug: value.slug,
    pathname: pagePath,
    is_home: value.is_home === true,
    settings: isRecord(value.settings) ? value.settings : null,
    layout: null,
    meta: isRecord(value.meta) ? value.meta : null,
    blocks: value.blocks.map((block, blockIndex) => mapLegacyBlock(block, pagePath, blockIndex, mediaById)),
  };
});

export const assertLegacyPreviewConfiguration = (
  source: string | undefined,
  pageMode: string | undefined,
  indexable: boolean,
): boolean => {
  const mode = pageMode?.trim() || "headless";

  if (mode !== "headless" && mode !== "legacy-preview") {
    throw new Error(`Unsupported BACKSTAGE_PAGE_MODE "${mode}". Use "headless" or "legacy-preview".`);
  }
  if (mode === "legacy-preview" && source !== "api") {
    throw new Error('BACKSTAGE_PAGE_MODE="legacy-preview" requires BACKSTAGE_SOURCE="api".');
  }
  if (mode === "legacy-preview" && indexable) {
    throw new Error("Legacy Preview is read-only and cannot be indexable. Set SITE_INDEXABLE=false.");
  }

  return mode === "legacy-preview";
};
