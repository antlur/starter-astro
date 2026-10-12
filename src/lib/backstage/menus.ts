import { mediaDimensions, safeAltText, safeImageUrl } from "../safe-url";

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
  serves?: string | null;
  priceType: string | null;
  price: string | null;
  prices: SiteMenuPrice[];
  dietaryTags: string[];
  imageUrl: string | null;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
  hiddenPrice: boolean;
}

export interface SiteMenuCategory {
  id: string;
  title: string;
  order: number | null;
  subtitle: string | null;
  description: string | null;
  afterDescription: string | null;
  serves?: string | null;
  pricingColumns?: string[];
  columns: number | null;
  items: SiteMenuItem[];
}

export interface SiteMenu {
  id: string;
  title: string;
  slug: string;
  isDefault?: boolean;
  isPublished?: boolean | null;
  subtitle: string | null;
  pdfUrl: string | null;
  categories: SiteMenuCategory[];
}

export const formatMenuPrice = (value: string): string => {
  const price = value.trim();
  if (price.startsWith("$")) return price;

  const amount = price.match(/^(-?\d+(?:,\d{3})*(?:\.\d{1,2})?)$/);
  if (!amount) return price;

  const numericAmount = Number(amount[1].replaceAll(",", ""));
  return Number.isFinite(numericAmount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numericAmount)
    : price;
};

export const selectMenuForIndex = (
  menus: readonly SiteMenu[],
  resolverMenuId?: string | null,
  associatedMenuIds?: readonly string[] | null,
): SiteMenu | null => {
  const publishedMenus = menus.filter((menu) => menu.isPublished !== false);

  if (resolverMenuId !== undefined && resolverMenuId !== null) {
    return publishedMenus.find((menu) => menu.id === resolverMenuId) ?? null;
  }

  if (associatedMenuIds !== undefined && associatedMenuIds !== null) {
    for (const menuId of associatedMenuIds) {
      const menu = publishedMenus.find((candidate) => candidate.id === menuId);
      if (menu) return menu;
    }
    return null;
  }

  return publishedMenus[0] ?? null;
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

const normalizePricingColumns = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((column) => isRecord(column)
      ? optionalString(column.label ?? column.title ?? column.name) ?? ""
      : optionalString(column) ?? "");
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([key, column]) => {
      const label = isRecord(column)
        ? optionalString(column.label ?? column.title ?? column.name)
        : optionalString(column);
      return label ?? (/^\d+$/.test(key) ? "" : key);
    });
  }

  return [];
};

const hasPriceEntries = (value: unknown): boolean =>
  (Array.isArray(value) && value.length > 0) || (isRecord(value) && Object.keys(value).length > 0);

const normalizePrices = (value: unknown, pricingColumns: readonly string[]): SiteMenuPrice[] => {
  const entries = Array.isArray(value)
    ? value.map((candidate, index) => [String(index), candidate] as const)
    : isRecord(value)
      ? Object.entries(value)
      : [];

  return entries.flatMap(([key, candidate], index) => {
    const amount = optionalString(isRecord(candidate) ? candidate.value ?? candidate.price : candidate);
    if (!amount) return [];

    const keyedLabel = /^\d+$/.test(key) || /^(?:price\d*)$/i.test(key) ? null : key;
    const position = /^\d+$/.test(key) ? Number(key) : index;
    const label = isRecord(candidate) ? optionalString(candidate.label) : null;

    return [{ label: label ?? keyedLabel ?? pricingColumns[position] ?? "", value: amount }];
  });
};

export const alignCategoryPrices = (
  pricingColumns: readonly string[],
  prices: readonly SiteMenuPrice[],
): SiteMenuPrice[] => {
  const aligned = new Array<SiteMenuPrice | undefined>(pricingColumns.length);
  const assignedPrices = new Set<number>();
  const normalizedColumns = pricingColumns.map((column) => column.trim().toLowerCase());

  prices.forEach((price, priceIndex) => {
    const label = price.label.trim().toLowerCase();
    if (!label) return;

    const columnIndex = normalizedColumns.indexOf(label);
    if (columnIndex < 0 || aligned[columnIndex]) return;

    aligned[columnIndex] = price;
    assignedPrices.add(priceIndex);
  });

  prices.forEach((price, priceIndex) => {
    if (assignedPrices.has(priceIndex)) return;

    const positionalIndex = priceIndex < aligned.length && !aligned[priceIndex]
      ? priceIndex
      : aligned.findIndex((candidate) => candidate === undefined);

    if (positionalIndex >= 0) aligned[positionalIndex] = price;
  });

  return pricingColumns.map((label, index) => ({ label, value: aligned[index]?.value ?? "" }));
};

const splitPrice = (value: string | null, pricingColumns: readonly string[]): SiteMenuPrice[] => {
  if (!value || !value.includes("|")) return [];
  return value.split("|").flatMap((part, index) => {
    const amount = part.trim();
    return amount ? [{ label: pricingColumns[index] ?? "", value: amount }] : [];
  });
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
  pricingColumns: readonly string[],
): SiteMenuItem => {
  if (!isRecord(value)) throw new Error(`Backstage menu contains an invalid item at index ${index}.`);
  const globalItem = isRecord(value.menu_item) ? value.menu_item : {};
  const title = optionalString(localValue(value, globalItem, "title"));
  const description = localValue(value, globalItem, "description");
  const subtitle = localValue(value, globalItem, "subtitle");
  const hasLocalPriceOverride = hasPriceEntries(value.prices)
    || optionalString(value.price) !== null
    || optionalString(value.price2) !== null;
  const priceType = optionalString(value.price_type)
    ?? (hasLocalPriceOverride ? null : optionalString(globalItem.price_type));
  const hiddenPrice = priceType === "hidden"
    || value.has_hidden_price === true
    || (value.has_hidden_price === undefined && !hasLocalPriceOverride && globalItem.has_hidden_price === true);
  const priceSource = hasLocalPriceOverride ? value : globalItem;
  const structuredPrices = normalizePrices(priceSource.prices, pricingColumns);
  const scalarPrice = optionalString(priceSource.price);
  const scalarPrice2 = optionalString(priceSource.price2);
  const scalarPrices = splitPrice(scalarPrice, pricingColumns);
  const prices = hiddenPrice
    ? []
    : structuredPrices.length > 0
      ? structuredPrices
      : scalarPrices.length > 0
        ? scalarPrices
        : [
            ...(scalarPrice ? [{ label: pricingColumns[0] ?? "", value: scalarPrice }] : []),
            ...(scalarPrice2 ? [{ label: pricingColumns[scalarPrice ? 1 : 0] ?? "", value: scalarPrice2 }] : []),
          ];
  const hasLocalImageOverride = value.image !== undefined || value.image_id !== undefined;
  const imageValue = mediaValue(hasLocalImageOverride ? value : globalItem, mediaById);
  const imageUrl = safeImageUrl(imageValue);
  const imageAlt = safeAltText(isRecord(imageValue) ? imageValue.alt : "");
  const imageDimensions = mediaDimensions(imageValue);

  if (!title) throw new Error(`Backstage menu item at index ${index} has no title.`);

  return {
    id: optionalString(value.id) ?? `${title}-${index}`,
    title,
    postTitle: optionalString(localValue(value, globalItem, "post_title")),
    subtitle: optionalString(subtitle),
    description: typeof description === "string" ? description : null,
    serves: optionalString(localValue(value, globalItem, "serves")),
    priceType,
    price: prices.length > 1 ? null : prices[0]?.value ?? null,
    prices,
    dietaryTags: normalizeDietaryTags(localValue(value, globalItem, "dietary_tags")),
    imageUrl,
    imageAlt,
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    hiddenPrice,
  };
};

export const normalizeMenu = (
  value: unknown,
  index = 0,
  mediaById: ReadonlyMap<string, unknown> = new Map(),
  now = new Date(),
): SiteMenu => {
  if (!isRecord(value) || !Array.isArray(value.categories)) {
    throw new Error(`Backstage returned an invalid menu at index ${index}.`);
  }
  const publishedAt = optionalString(value.published_at);
  const isPublished = value.published_at === undefined
    ? null
    : Boolean(publishedAt && Date.parse(publishedAt) < now.getTime());

  return {
    id: requiredString(value.id, "ID"),
    title: requiredString(value.title, "title"),
    slug: requiredString(value.slug, "slug"),
    isDefault: value.is_default === true,
    isPublished,
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
        const pricingColumns = normalizePricingColumns(candidate.pricing_columns);
        return {
          sourceIndex: categoryIndex,
          id: optionalString(candidate.id) ?? `${value.slug}-category-${categoryIndex}`,
          title: requiredString(candidate.title, "category title"),
          order: Number.isInteger(order) ? order : null,
          subtitle: optionalString(candidate.subtitle),
          description: optionalString(candidate.description),
          afterDescription: optionalString(candidate.after_description),
          serves: optionalString(candidate.serves),
          pricingColumns,
          columns: Number.isInteger(columns) && columns > 0 ? Math.min(columns, 3) : null,
          items: candidate.items.map((item, itemIndex) =>
            normalizeMenuItem(item, itemIndex, mediaById, pricingColumns),
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
