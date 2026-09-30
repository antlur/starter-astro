import { sanitizeRichText } from "../lib/sanitize-rich-text";
import { normalizeRoutePath } from "./routes";

interface BlueprintField {
  name: string;
  slug: string;
  type: string;
  is_primary: boolean;
  show_in_list: boolean;
}

interface BlueprintBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: BlueprintField[];
}

export interface PresentedImage {
  src: string;
  alt: string;
}

export type PresentedValue =
  | { kind: "text"; text: string; href?: string }
  | { kind: "html"; html: string }
  | { kind: "images"; images: PresentedImage[] }
  | { kind: "files"; files: Array<{ href: string; label: string }> };

export interface PresentedField {
  name: string;
  slug: string;
  value: PresentedValue;
}

export interface BlueprintEntrySummary {
  id: string;
  path: string;
  title: string;
  fields: PresentedField[];
}

interface BlueprintRouteBase {
  path: string;
  blueprint: BlueprintBase;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface BlueprintIndexRoute extends BlueprintRouteBase {
  kind: "index";
  entries: BlueprintEntrySummary[];
}

export interface BlueprintEntryRoute extends BlueprintRouteBase {
  kind: "entry";
  id: string;
  fields: PresentedField[];
}

export type BlueprintRoute = BlueprintIndexRoute | BlueprintEntryRoute;
export type RouteResolver = (path: string) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Backstage blueprint route has an invalid ${label}.`);
  }

  return value.trim();
};

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const normalizeBlueprint = (value: unknown): BlueprintBase => {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    throw new Error("Backstage route metadata has an invalid blueprint definition.");
  }

  const fields = value.fields.map((candidate): BlueprintField => {
    if (!isRecord(candidate)) throw new Error("Backstage blueprint contains an invalid field definition.");

    return {
      name: requiredString(candidate.name, "blueprint field name"),
      slug: requiredString(candidate.slug, "blueprint field slug"),
      type: requiredString(candidate.type, "blueprint field type"),
      is_primary: candidate.is_primary === true,
      show_in_list: candidate.show_in_list !== false,
    };
  });

  return {
    id: requiredString(value.id, "blueprint ID"),
    name: requiredString(value.name, "blueprint name"),
    slug: requiredString(value.slug, "blueprint slug"),
    description: optionalString(value.description),
    fields,
  };
};

const plainText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(", ");
  if (!isRecord(value)) return "";

  for (const key of ["name", "title", "label", "value", "file_name"]) {
    const candidate = plainText(value[key]);
    if (candidate) return candidate;
  }

  return Object.values(value).map(plainText).filter(Boolean).join(", ");
};

const safeWebUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

const safeLinkUrl = (value: string): string | undefined => {
  const candidate = value.trim();
  if (candidate.startsWith("#")) return candidate;

  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    const url = new URL(candidate, "https://backstage.invalid");
    return url.pathname + url.search + url.hash;
  }

  try {
    const url = new URL(candidate);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const presentValue = (field: BlueprintField, value: unknown): PresentedValue | null => {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  if (field.type === "rich_text" && typeof value === "string") {
    const html = sanitizeRichText(value);
    return html ? { kind: "html", html } : null;
  }

  if (field.type === "media") {
    const candidates = Array.isArray(value) ? value : [value];
    const files = candidates.flatMap((candidate): Array<{ href: string; label: string }> => {
      if (!isRecord(candidate)) return [];
      const href = safeWebUrl(candidate.url);
      if (!href) return [];
      return [{ href, label: optionalString(candidate.file_name) ?? field.name }];
    });

    return files.length > 0 ? { kind: "files", files } : null;
  }

  if (["image", "image_list"].includes(field.type)) {
    const candidates = Array.isArray(value) ? value : [value];
    const images = candidates.flatMap((candidate): PresentedImage[] => {
      if (!isRecord(candidate)) return [];
      const src = safeWebUrl(candidate.url);
      if (!src) return [];

      return [{ src, alt: optionalString(candidate.alt) ?? field.name }];
    });

    return images.length > 0 ? { kind: "images", images } : null;
  }

  const text = plainText(value);
  if (!text) return null;

  const href = field.type === "url" ? safeLinkUrl(text) : undefined;
  return { kind: "text", text, href };
};

const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

const entryFields = (blueprint: BlueprintBase, entry: Record<string, unknown>): PresentedField[] => {
  const values = isRecord(entry.unstable_data) ? entry.unstable_data : isRecord(entry.data) ? entry.data : {};

  return blueprint.fields.flatMap((field) => {
    const value = values[field.slug];
    if (isEmptyValue(value)) return [];
    const presented = presentValue(field, value);
    return presented ? [{ name: field.name, slug: field.slug, value: presented }] : [];
  });
};

const normalizeEntryId = (value: unknown): string => {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Backstage blueprint route contains an entry without an ID.");
  }

  return String(value);
};

const entryPrimaryText = (
  entry: Record<string, unknown>,
  blueprint: BlueprintBase,
  fields: PresentedField[],
): string => {
  const explicit = plainText(entry.primary_field_value);
  if (explicit) return explicit;

  const primaryField = blueprint.fields.find((field) => field.is_primary);
  const primaryValue = fields.find((field) => field.slug === primaryField?.slug)?.value;
  if (primaryValue?.kind === "text") return primaryValue.text;
  if (primaryValue?.kind === "html") return plainText(primaryValue.html.replace(/<[^>]*>/g, " "));

  const data = isRecord(entry.unstable_data) ? entry.unstable_data : isRecord(entry.data) ? entry.data : {};
  return plainText(data[primaryField?.slug ?? ""]) || optionalString(entry.slug) || "Untitled";
};

const normalizeSeo = (value: unknown): { title: string | null; description: string | null } => {
  if (!isRecord(value)) return { title: null, description: null };
  return { title: optionalString(value.title), description: optionalString(value.description) };
};

const collectionEntries = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  return null;
};

export const parseBlueprintRoute = (path: string, value: unknown): BlueprintRoute | null => {
  if (!isRecord(value) || !isRecord(value.meta)) {
    throw new Error(`Backstage returned an invalid route response for ${path}.`);
  }

  const canonicalPath = normalizeRoutePath(path);
  if (normalizeRoutePath(requiredString(value.meta.path, "canonical path")) !== canonicalPath) {
    throw new Error(`Backstage resolved ${path} to a different canonical path.`);
  }

  if (!("blueprint" in value.meta)) return null;

  const blueprint = normalizeBlueprint(value.meta.blueprint);
  const seo = normalizeSeo(value.meta.seo);
  const entries = collectionEntries(value.data);

  if (entries) {
    return {
      kind: "index",
      path: canonicalPath,
      blueprint,
      title: blueprint.name,
      seoTitle: seo.title,
      seoDescription: seo.description ?? blueprint.description,
      entries: entries.map((candidate): BlueprintEntrySummary => {
        if (!isRecord(candidate)) throw new Error(`Blueprint collection ${path} contains an invalid entry.`);
        const primaryField = blueprint.fields.find((field) => field.is_primary);
        const allFields = entryFields(blueprint, candidate);
        const fields = allFields
          .filter((field) => field.slug !== primaryField?.slug && blueprint.fields.find((item) => item.slug === field.slug)?.show_in_list)
          .slice(0, 3);
        return {
          id: normalizeEntryId(candidate.id),
          path: "",
          title: entryPrimaryText(candidate, blueprint, allFields),
          fields,
        };
      }),
    };
  }

  if (!isRecord(value.data)) {
    throw new Error(`Backstage blueprint route ${path} does not contain an entry.`);
  }

  const entry = value.data;
  const id = normalizeEntryId(entry.id);
  const allFields = entryFields(blueprint, entry);
  const primaryField = blueprint.fields.find((field) => field.is_primary);
  const fields = allFields.filter((field) => field.slug !== primaryField?.slug);
  const entrySeo = normalizeSeo(entry.seo);

  return {
    kind: "entry",
    id,
    path: canonicalPath,
    blueprint,
    title: entryPrimaryText(entry, blueprint, allFields),
    seoTitle: entrySeo.title ?? seo.title,
    seoDescription: entrySeo.description ?? seo.description,
    fields,
  };
};

const withConcurrency = async <T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
};

export const resolveBlueprintRoutes = async (
  paths: readonly string[],
  resolver: RouteResolver,
): Promise<{ routes: BlueprintRoute[]; unhandledPaths: string[] }> => {
  const resolved = await withConcurrency(paths, 4, async (path) => ({
    path,
    route: parseBlueprintRoute(path, await resolver(path).catch((error: unknown) => {
      throw new Error(`Failed to resolve Backstage route ${path}.`, { cause: error });
    })),
  }));
  const routes = resolved.flatMap(({ route }) => route ? [route] : []);
  const unhandledPaths = resolved.flatMap(({ path, route }) => route ? [] : [path]);
  const entryPaths = new Map<string, string>();

  for (const route of routes) {
    if (route.kind !== "entry") continue;
    if (entryPaths.has(route.blueprint.id + ":" + route.id)) {
      throw new Error(`Backstage returned duplicate entry routes for ${route.title}.`);
    }
    entryPaths.set(route.blueprint.id + ":" + route.id, route.path);
  }

  return {
    routes: routes.map((route) => route.kind === "index"
      ? {
          ...route,
          entries: route.entries.flatMap((entry) => {
            const entryPath = entryPaths.get(route.blueprint.id + ":" + entry.id);
            return entryPath ? [{ ...entry, path: entryPath }] : [];
          }),
        }
      : route),
    unhandledPaths,
  };
};
