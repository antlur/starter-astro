import type { SiteContent, SiteNavigationItem } from "../lib/backstage/content";
import { normalizeLocation } from "../lib/backstage/locations";
import { normalizeMenu } from "../lib/backstage/menus";

const makeMenu = (slug: string, title: string, item: string, price: string) => ({
  id: `fixture-menu-${slug}`,
  slug,
  title,
  published_at: "2020-01-01T00:00:00Z",
  categories: [{ title: "From the kitchen", items: [{ title: item, price }] }],
});

const allDay = makeMenu("all-day", "All Day", "Charred squash toast", "12.00");
const marketBrunch = makeMenu("market-brunch", "Market Brunch", "Market biscuit plate", "14.00");
const riverSupper = makeMenu("river-supper", "River Supper", "River white bean stew", "18.00");

const menuAt = (menu: ReturnType<typeof makeMenu>, slug = menu.slug, title = menu.title) => ({
  ...menu,
  slug,
  title,
});

const hours = [
  {
    label: "Regular Hours",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      .map((day) => ({ day, openTime: "11:00", closeTime: "21:00" })),
  },
  {
    label: "Brunch Hours",
    days: ["Saturday", "Sunday"].map((day) => ({ day, openTime: "09:00", closeTime: "13:00" })),
  },
];

const makeLocation = (slug: string, name: string, number: number) => ({
  id: `fixture-location-${slug}`,
  slug,
  status: "open",
  is_public: true,
  name,
  address: `${number} Tasting Lane`,
  city: "Example City",
  state: "IL",
  zip: "60601",
  phone: `(312) 555-01${number}`,
  map_link: `https://maps.example.test/${slug}`,
  timezone: "America/Chicago",
  hours,
  menus: [menuAt(allDay)],
  special_hours: [],
  ordering_links: [],
  reservation_links: [],
  waitlist_links: [],
});

const hiddenLocation = {
  ...makeLocation("test-kitchen", "Private Test Kitchen", 16),
  is_public: false,
  ordering_links: [{ service: "toast", url: "https://toast.example.test/test-kitchen" }],
};

const publicLocations = [
  {
    ...makeLocation("market-street", "Market Street", 11),
    menus: [menuAt(allDay, "market-all-day", "Market All Day"), menuAt(marketBrunch)],
    special_hours: [{
      id: "fixture-holiday-closure",
      title: "Winter Holiday",
      date: "2030-12-25",
      closed24Hours: true,
      open24Hours: false,
      openTime: null,
      closeTime: null,
      notes: null,
    }],
    ordering_links: [{ service: "toast", url: "https://toast.example.test/market-street" }],
    reservation_links: [{ service: "resy", url: "https://resy.example.test/market-street" }],
  },
  {
    ...makeLocation("riverfront", "Riverfront", 12),
    menus: [menuAt(allDay, "river-all-day", "River All Day"), menuAt(riverSupper)],
    ordering_links: [{ service: "chownow", url: "https://chownow.example.test/riverfront" }],
    waitlist_links: [{ service: "yelp", url: "https://yelp.example.test/riverfront" }],
  },
  {
    ...makeLocation("north-loop", "North Loop", 13),
    reservation_links: [{ service: "opentable", url: "https://opentable.example.test/north-loop" }],
  },
  {
    ...makeLocation("west-end", "West End", 14),
    waitlist_links: [{ service: "yelp", url: "https://yelp.example.test/west-end" }],
  },
  makeLocation("south-lawn", "South Lawn", 15),
];

const rawLocations = [hiddenLocation, ...publicLocations];
const resolveRoute = (path: string, type: string, data: unknown, id: string | null, location?: unknown) =>
  [path, { type, data, meta: { id, type, path, ...(location === undefined ? {} : { location }) } }] as const;

export const multiLocationRouteResolutions: Record<string, unknown> = Object.fromEntries([
  resolveRoute("/locations/", "locations", rawLocations, null),
  ...publicLocations.flatMap((location) => {
    const path = `/locations/${location.slug}/`;
    return [
      resolveRoute(path, "location", location, location.id),
      ...location.menus.map((menu) =>
        resolveRoute(`${path}menu/${menu.slug}/`, "menu", menu, menu.id, location),
      ),
    ];
  }),
]);

const nav = (slug: string, text: string, style: SiteNavigationItem["style"] = "link"): SiteNavigationItem => ({
  id: `fixture-nav-${slug}`,
  text,
  url: `/${slug}/`,
  style,
  newWindow: false,
  children: [],
});

export const multiLocationSiteContent: SiteContent = {
  site: {
    name: "Fieldwork Kitchen",
    domain: null,
    socialLinks: [],
    homeCta: null,
  },
  pages: [{
    id: "fixture-restaurant-home",
    title: "Fieldwork Kitchen",
    slug: "/",
    pathname: "/",
    is_home: true,
    settings: {},
    layout: null,
    blocks: [{
      id: "fixture-restaurant-intro",
      type: "rich-text",
      fields: { body: "<h1>Fieldwork Kitchen</h1><p>Seasonal cooking across five neighborhoods.</p>" },
    }],
  }],
  // /menu/ is a placeholder in the public graph. Service pickers are starter-owned.
  routePaths: ["/", "/menu/", ...Object.keys(multiLocationRouteResolutions)],
  navigation: [
    nav("locations", "Locations"),
    nav("menu", "Menu"),
    nav("order-online", "Order online", "button"),
    nav("reservations", "Reservations"),
    nav("waitlist", "Waitlist"),
  ],
  footerNavigation: [nav("locations", "Locations")],
  alerts: [],
  menus: [allDay, marketBrunch, riverSupper].map((menu) => normalizeMenu(menu)),
  locations: rawLocations.map(normalizeLocation),
  structuredData: null,
  events: [],
  pressReleases: [],
};
