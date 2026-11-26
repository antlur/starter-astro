export const googleAnalyticsId = (value: unknown): string | null => {
  const id = typeof value === "string" ? value.trim() : "";
  return /^G-[A-Z0-9]+$/.test(id) ? id : null;
};

type AnalyticsParameters = Partial<Record<
  "location" | "store" | "social_network" | "category" | "label" | "event_category" | "event_label",
  string | null
>>;

export const analyticsLink = (name: string, params: AnalyticsParameters = {}): Record<string, string> => {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) return {};
  const values = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value.trim()));
  return { "data-ga-event": name, "data-ga-params": JSON.stringify(values) };
};
