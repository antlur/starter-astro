import { mediaAltText, mediaDimensions, safeImageUrl, safeSiteLinkUrl } from "../safe-url";

export interface SiteLocationHours {
  day: string;
  value: string;
  order: number;
}

export interface SiteLocation {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  mapUrl: string | null;
  mapEmbedUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
  loyaltyUrl: string | null;
  hours: SiteLocationHours[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const safeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const safeMapEmbedUrl = (value: unknown): string | null => {
  const candidate = safeHttpUrl(value);
  if (!candidate) return null;

  const url = new URL(candidate);
  return url.hostname === "www.google.com" && url.pathname === "/maps/embed" ? url.href : null;
};

export const locationSchemaUrl = (site: URL | undefined, pathname: string): string | undefined =>
  site ? new URL(pathname, site).href : undefined;

const coordinate = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const locationHourRows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((group) => {
    if (!isRecord(group)) return [];
    if (Array.isArray(group.days)) return group.days.filter(isRecord);
    return [group];
  });
};

const dayOrder = new Map([
  ["monday", 0], ["tuesday", 1], ["wednesday", 2], ["thursday", 3],
  ["friday", 4], ["saturday", 5], ["sunday", 6],
]);

const formatTime = (value: string): string => {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minutes = match[2];
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}${minutes === "00" ? "" : `:${minutes}`} ${meridiem}`;
};

const scheduleValue = (day: Record<string, unknown>): string | null => {
  if (day.hidden === true) return null;
  if (day.closed24Hours === true || day.closed === true) return "Closed";
  if (day.open24Hours === true) return "Open 24 hours";

  const open = optionalString(day.openTime ?? day.open_time);
  const close = optionalString(day.closeTime ?? day.close_time);
  if (!open || !close) return null;

  const notes = optionalString(day.notes);
  return `${formatTime(open)} - ${formatTime(close)}${notes ? ` (${notes})` : ""}`;
};

export const normalizeLocationHours = (value: unknown): SiteLocationHours[] =>
  groupLocationHours(locationHourRows(value).flatMap((row) => {
    const day = optionalString(row.day ?? row.name);
    const value = scheduleValue(row);
    const order = day ? dayOrder.get(day.toLowerCase()) : undefined;
    return day && value && order !== undefined ? [{ day, value, order }] : [];
  }).sort((left, right) => left.order - right.order));

export const groupLocationHours = (hours: SiteLocationHours[]): SiteLocationHours[] => {
  const abbreviations = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grouped: SiteLocationHours[] = [];

  for (const hoursForDay of hours) {
    const previous = grouped.at(-1);
    if (previous && previous.value === hoursForDay.value && previous.order + 1 === hoursForDay.order) {
      const firstDay = previous.day.split("-")[0];
      previous.day = `${firstDay}-${abbreviations[hoursForDay.order]}`;
      previous.order = hoursForDay.order;
      continue;
    }

    grouped.push({
      ...hoursForDay,
      day: abbreviations[hoursForDay.order],
    });
  }

  return grouped;
};

const locationAddressLines = (value: Record<string, unknown>): string[] => {
  const cityRegion = [optionalString(value.city), optionalString(value.state)].filter(Boolean).join(", ");
  const cityLine = [cityRegion, optionalString(value.zip)].filter(Boolean).join(" ");

  if (isRecord(value.address)) {
    const address = value.address;
    return [
      optionalString(address.line1 ?? address.address),
      optionalString(address.line2 ?? address.address2),
      cityLine || [address.city, address.state, address.zip].map(optionalString).filter(Boolean).join(", "),
    ].filter((line): line is string => Boolean(line));
  }

  return [
    optionalString(value.address),
    optionalString(value.address2),
    cityLine,
  ].filter((line): line is string => Boolean(line));
};

export const normalizeLocation = (value: unknown, index = 0): SiteLocation => {
  if (!isRecord(value)) throw new Error(`Backstage returned an invalid location at index ${index}.`);
  const dimensions = mediaDimensions(value.featured_media);

  return {
    id: optionalString(value.id) ?? `location-${index}`,
    slug: optionalString(value.slug),
    name: optionalString(value.name) ?? "Location",
    description: optionalString(value.description),
    addressLines: locationAddressLines(value),
    phone: optionalString(value.phone),
    email: optionalString(value.email),
    mapUrl: safeHttpUrl(value.map_link),
    mapEmbedUrl: safeMapEmbedUrl(value.map_embed),
    latitude: coordinate(value.latitude),
    longitude: coordinate(value.longitude),
    timezone: optionalString(value.timezone),
    imageUrl: safeImageUrl(value.featured_media),
    imageAlt: mediaAltText(value.featured_media),
    imageWidth: dimensions?.width,
    imageHeight: dimensions?.height,
    loyaltyUrl: safeSiteLinkUrl(value.loyalty_url),
    hours: normalizeLocationHours(value.hours),
  };
};
