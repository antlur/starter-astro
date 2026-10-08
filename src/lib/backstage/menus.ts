import { safeAltText, safeImageUrl } from "../safe-url";

export interface SiteMenuPrice {
  label: string;
  value: string;
}

export interface SiteMenuItem {
  id: string;
  title: string;
  postTitle: string | null;
  subtitle: string | null;
  description: string | null;
  priceType: string | null;
  price: string | null;
  prices: SiteMenuPrice[];
  dietaryTags: string[];
  imageUrl: string | null;
  imageAlt: string;
  hiddenPrice: boolean;
}

export interface SiteMenuCategory {
  id: string;
  title: string;
  order: number | null;
  subtitle: string | null;
  description: string | null;
  afterDescription: string | null;
  columns: number | null;
  items: SiteMenuItem[];
}

export interface SiteMenu {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  pdfUrl: string | null;
  categories: SiteMenuCategory[];
}

export interface SiteMenuRoute {
  path: string;
  label: string;
  menu: SiteMenu;
}

export const uniqueMenuRoutes = (
  routes: readonly SiteMenuRoute[],
  currentPath?: string,
): SiteMenuRoute[] => {
  const routesByMenu = new Map<string, SiteMenuRoute>();

  for (const route of routes) {
    const existing = routesByMenu.get(route.menu.id);
    if (!existing || route.path === currentPath) routesByMenu.set(route.menu.id, route);
  }

  return [...routesByMenu.values()];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Backstage menu has an invalid ${label}.`);
  }

  const normalized = String(value).trim();
  if (!normalized) throw new Error(`Backstage menu has an invalid ${label}.`);
  return normalized;
};

const optionalString = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeDietaryTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((tag) => {
    const normalized = optionalString(tag);
    return normalized ? [normalized] : [];
  });
};

const safeDocumentUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const normalizePrices = (value: unknown): SiteMenuPrice[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const amount = optionalString(candidate.value ?? candidate.price);
    if (!amount) return [];

    return [{ label: optionalString(candidate.label) ?? "", value: amount }];
  });
};

const splitPrice = (value: string | null): SiteMenuPrice[] => {
  if (!value || !value.includes("|")) return [];
  return value.split("|").map((part) => part.trim()).filter(Boolean).map((part) => ({ label: "", value: part }));
};

const localValue = (
  item: Record<string, unknown>,
  globalItem: Record<string, unknown>,
  key: string,
): unknown => item[key] === undefined || item[key] === null || item[key] === ""
  ? globalItem[key]
  : item[key];

const mediaValue = (
  item: Record<string, unknown>,
  mediaById: ReadonlyMap<string, unknown>,
): unknown => {
  if (item.image !== undefined && safeImageUrl(item.image)) return item.image;
  if (item.image_id !== undefined && item.image_id !== null) {
    return mediaById.get(String(item.image_id)) ?? null;
  }
  return item.image ?? null;
};

const normalizeMenuItem = (
  value: unknown,
  index: number,
  mediaById: ReadonlyMap<string, unknown>,
): SiteMenuItem => {
  if (!isRecord(value)) throw new Error(`Backstage menu contains an invalid item at index ${index}.`);
  const globalItem = isRecord(value.menu_item) ? value.menu_item : {};
  const title = optionalString(localValue(value, globalItem, "title"));
  const description = localValue(value, globalItem, "description");
  const subtitle = localValue(value, globalItem, "subtitle");
  const priceType = optionalString(localValue(value, globalItem, "price_type"));
  const hiddenPrice = priceType === "hidden"
    || value.has_hidden_price === true
    || (value.has_hidden_price === undefined && globalItem.has_hidden_price === true);
  const hasLocalPriceOverride = (Array.isArray(value.prices) && value.prices.length > 0)
    || optionalString(value.price) !== null
    || optionalString(value.price2) !== null;
  const priceSource = hasLocalPriceOverride ? value : globalItem;
  const structuredPrices = normalizePrices(priceSource.prices);
  const scalarPrice = optionalString(priceSource.price);
  const scalarPrice2 = optionalString(priceSource.price2);
  const scalarPrices = splitPrice(scalarPrice);
  const prices = hiddenPrice
    ? []
    : structuredPrices.length > 0
      ? structuredPrices
      : scalarPrices.length > 0
        ? scalarPrices
        : [
            ...(scalarPrice ? [{ label: "", value: scalarPrice }] : []),
            ...(scalarPrice2 ? [{ label: "", value: scalarPrice2 }] : []),
          ];
  const hasLocalImageOverride = value.image !== undefined || value.image_id !== undefined;
  const imageValue = mediaValue(hasLocalImageOverride ? value : globalItem, mediaById);
  const imageUrl = safeImageUrl(imageValue);
  const imageAlt = safeAltText(isRecord(imageValue) ? imageValue.alt : "");

  if (!title) throw new Error(`Backstage menu item at index ${index} has no title.`);

  return {
    id: optionalString(value.id) ?? `${title}-${index}`,
    title,
    postTitle: optionalString(localValue(value, globalItem, "post_title")),
    subtitle: optionalString(subtitle),
    description: typeof description === "string" ? description : null,
    priceType,
    price: prices.length > 1 ? null : prices[0]?.value ?? null,
    prices,
    dietaryTags: normalizeDietaryTags(localValue(value, globalItem, "dietary_tags")),
    imageUrl,
    imageAlt,
    hiddenPrice,
  };
};

export const normalizeMenu = (
  value: unknown,
  index = 0,
  mediaById: ReadonlyMap<string, unknown> = new Map(),
): SiteMenu => {
  if (!isRecord(value) || !Array.isArray(value.categories)) {
    throw new Error(`Backstage returned an invalid menu at index ${index}.`);
  }

  return {
    id: requiredString(value.id, "ID"),
    title: requiredString(value.title, "title"),
    slug: requiredString(value.slug, "slug"),
    subtitle: optionalString(value.subtitle),
    pdfUrl: safeDocumentUrl(value.pdf_url),
    categories: value.categories
      .map((candidate, categoryIndex) => {
        if (!isRecord(candidate) || !Array.isArray(candidate.items)) {
          throw new Error(`Backstage menu ${String(value.slug)} has an invalid category at index ${categoryIndex}.`);
        }

        const columns = Number(candidate.column_count);
        const orderValue = candidate.order;
        const order = typeof orderValue === "number"
          || (typeof orderValue === "string" && orderValue.trim() !== "")
          ? Number(orderValue)
          : Number.NaN;
        return {
          sourceIndex: categoryIndex,
          id: optionalString(candidate.id) ?? `${value.slug}-category-${categoryIndex}`,
          title: requiredString(candidate.title, "category title"),
          order: Number.isInteger(order) ? order : null,
          subtitle: optionalString(candidate.subtitle),
          description: optionalString(candidate.description),
          afterDescription: optionalString(candidate.after_description),
          columns: Number.isInteger(columns) && columns > 0 ? Math.min(columns, 3) : null,
          items: candidate.items.map((item, itemIndex) =>
            normalizeMenuItem(item, itemIndex, mediaById),
          ),
        };
      })
      .sort((left, right) => {
        if (left.order === null && right.order === null) return left.sourceIndex - right.sourceIndex;
        if (left.order === null) return 1;
        if (right.order === null) return -1;
        return left.order - right.order || left.sourceIndex - right.sourceIndex;
      })
      .map(({ sourceIndex: _sourceIndex, ...category }) => category),
  };
};
