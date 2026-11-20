import type { LocationService, SiteLocation } from "../lib/backstage/locations";

export const locationServices = {
  ordering: { path: "/order-online/", label: "Order online" },
  delivery: { path: "/delivery/", label: "Order delivery" },
  reservation: { path: "/reservations/", label: "Reservations" },
  waitlist: { path: "/waitlist/", label: "Join the waitlist" },
} satisfies Record<LocationService, { path: string; label: string }>;

export type LocationChoice = "menu" | LocationService;

export const locationServiceLinks = (location: SiteLocation, service: LocationService) =>
  location.providerLinks?.[service] ?? [];
