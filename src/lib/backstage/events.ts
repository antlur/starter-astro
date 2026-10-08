import { mediaAltText, mediaDimensions, safeImageUrl, safeLinkUrl } from "../safe-url";

export interface SiteEvent {
  id: string;
  slug: string;
  publicPath: string | null;
  title: string;
  startTime: string;
  endTime: string | null;
  timezone: string | null;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
  ticketUrl: string | null;
}

export interface EventScheduleLabels {
  startDate: string;
  endDate: string | null;
  startTime: string;
  endTime: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const normalizeEvent = (value: unknown, index = 0): SiteEvent => {
  if (
    !isRecord(value)
    || (typeof value.id !== "number" && typeof value.id !== "string")
    || typeof value.slug !== "string"
    || value.slug.trim() === ""
    || typeof value.title !== "string"
    || typeof value.start_time !== "string"
    || Number.isNaN(Date.parse(value.start_time))
  ) {
    throw new Error(`Backstage returned an invalid event at index ${index}.`);
  }

  const endTime = optionalText(value.end_time);
  if (endTime && Number.isNaN(Date.parse(endTime))) {
    throw new Error(`Backstage event ${String(value.id)} has an invalid end time.`);
  }

  const coverMedia = isRecord(value.cover_media) ? value.cover_media : null;
  const dimensions = mediaDimensions(coverMedia);

  return {
    id: String(value.id),
    slug: value.slug.trim(),
    publicPath: null,
    title: value.title.trim(),
    startTime: value.start_time,
    endTime,
    timezone: optionalText(value.timezone),
    shortDescription: optionalText(value.short_description),
    description: optionalText(value.description),
    imageUrl: safeImageUrl(coverMedia),
    imageAlt: mediaAltText(coverMedia),
    imageWidth: dimensions?.width,
    imageHeight: dimensions?.height,
    ticketUrl: safeLinkUrl(value.ticket_uri),
  };
};

export const selectUpcomingEvents = (
  events: SiteEvent[],
  count: unknown,
  now = Date.now(),
): SiteEvent[] => {
  const requestedCount = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 3;
  const limit = Math.max(1, Math.min(requestedCount, 12));

  return events
    .filter((event) => Date.parse(event.endTime ?? event.startTime) >= now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, limit);
};

const zonedFormatter = (
  options: Intl.DateTimeFormatOptions,
  timezone: string | null,
): Intl.DateTimeFormat => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Intl.DateTimeFormat("en-US", options);
  }
};

export const eventScheduleLabels = (event: SiteEvent): EventScheduleLabels => {
  const start = new Date(event.startTime);
  const end = event.endTime ? new Date(event.endTime) : null;
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const keyOptions: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  const startDate = zonedFormatter(dateOptions, event.timezone).format(start);
  const startTime = zonedFormatter(timeOptions, event.timezone).format(start);

  if (!end) return { startDate, endDate: null, startTime, endTime: null };

  const sameDay = zonedFormatter(keyOptions, event.timezone).format(start)
    === zonedFormatter(keyOptions, event.timezone).format(end);
  const endTime = zonedFormatter(timeOptions, event.timezone).format(end);

  return {
    startDate,
    endDate: sameDay ? null : zonedFormatter(dateOptions, event.timezone).format(end),
    startTime,
    endTime: sameDay && startTime === endTime ? null : endTime,
  };
};
