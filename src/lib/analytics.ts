import { GAEvents } from "@antlur/backstage/constants/google-events";
import type { LocationService, SiteLocation } from "./backstage/locations";

export const googleAnalyticsId = (value: unknown): string | null => {
  const id = typeof value === "string" ? value.trim() : "";
  return /^G-[A-Z0-9]+$/.test(id) ? id : null;
};

type AnalyticsParameters = Partial<Record<
  "location" | "store" | "social_network" | "category" | "label" | "event_category" | "event_label" | "form_id",
  string | null
>> & { order_type?: "pickup" | "delivery" };

interface ProviderEvent {
  name: string;
  store?: string;
  order_type?: AnalyticsParameters["order_type"];
}

export const serviceAnalytics = {
  ordering: { name: GAEvents.CLICK_TO_ORDER, order_type: "pickup" },
  delivery: { name: GAEvents.CLICK_TO_ORDER, order_type: "delivery" },
  reservation: { name: "click_to_reserve" },
  waitlist: { name: GAEvents.CLICK_TO_WAITLIST },
} satisfies Record<LocationService, ProviderEvent>;

export const providerEventsByUrl = (locations: Pick<SiteLocation, "slug" | "providerLinks">[]): Record<string, ProviderEvent> => {
  const candidates = new Map<string, ProviderEvent[]>();
  for (const { slug, providerLinks } of locations) {
    for (const service of Object.keys(serviceAnalytics) as LocationService[]) {
      for (const { url } of providerLinks?.[service] ?? []) {
        const matches = candidates.get(url) ?? [];
        matches.push({ ...serviceAnalytics[service], store: slug ?? undefined });
        candidates.set(url, matches);
      }
    }
  }

  return Object.fromEntries([...candidates].flatMap(([url, matches]) => {
    const { name, store, order_type } = matches[0];
    if (!matches.every((match) => match.name === name)) return [];
    return [[url, {
      name,
      store: matches.every((match) => match.store === store) ? store : undefined,
      order_type: matches.every((match) => match.order_type === order_type) ? order_type : undefined,
    }]];
  }));
};

export const emitAnalyticsEvent = (name: string, params: AnalyticsParameters = {}): void => {
  if (typeof window === "undefined" || !document.querySelector("[data-google-analytics]")) return;
  const { gtag } = window as Window & { gtag?: (command: "event", name: string, params: AnalyticsParameters) => void };
  try {
    gtag?.("event", name, params);
  } catch {
    // Analytics must not interrupt the visitor's action.
  }
};

export const analyticsLink = (name: string, params: AnalyticsParameters = {}): Record<string, string> => {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) return {};
  const values = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value.trim()));
  return { "data-ga-event": name, "data-ga-params": JSON.stringify(values) };
};
