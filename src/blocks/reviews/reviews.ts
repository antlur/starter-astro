export type Review = {
  quote: string;
  attribution?: string;
  location?: string;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const reviewHeading = (value: unknown) => text(value) || "Reviews";

export const resolveReviews = (demo: readonly Review[], published: unknown): readonly Review[] => {
  if (demo.length > 0) return demo;
  if (!Array.isArray(published)) return [];

  return published.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const quote = text(value.quote);
    return quote ? [{ quote, attribution: text(value.attribution), location: text(value.location) }] : [];
  });
};
