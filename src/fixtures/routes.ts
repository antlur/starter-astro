const blueprint = {
  id: "fixture-happenings-blueprint",
  name: "Happenings",
  slug: "happenings",
  slug_single: "happening",
  description: "Gatherings, dinners, and news from the Fieldwork community.",
  fields: [
    { id: "fixture-title", name: "Title", slug: "title", type: "text", is_primary: true, show_in_list: true },
    { id: "fixture-summary", name: "Summary", slug: "summary", type: "textarea", is_primary: false, show_in_list: true },
    { id: "fixture-body", name: "Details", slug: "details", type: "rich_text", is_primary: false, show_in_list: false },
    { id: "fixture-image", name: "Photo", slug: "photo", type: "image", is_primary: false, show_in_list: false },
  ],
};

const entries = [
  {
    id: "fixture-community-supper",
    slug: "community-supper",
    status: "published",
    primary_field_value: "Community Supper",
    seo: {
      title: "Community Supper",
      description: "An evening meal with our neighbors, built around fresh, seasonal cooking.",
    },
    unstable_data: {
      title: "Community Supper",
      summary: "An evening meal with our neighbors, built around what is fresh and in season.",
      details: "<p>Join us for a relaxed evening at the long table. The kitchen will serve a seasonal menu with vegetables from nearby farms, house-baked bread, and coffee to finish.</p><p>Seats are limited. Please arrive a few minutes early so we can welcome everyone together.</p>",
      photo: {
        id: "fixture-supper-photo",
        file_name: "community-supper.jpg",
        url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=85",
        thumb: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=480&q=80",
        width: 1400,
        height: 933,
      },
    },
  },
  {
    id: "fixture-draft-happening",
    slug: "coming-soon",
    status: "draft",
    primary_field_value: "Coming Soon",
    unstable_data: { title: "Coming Soon", summary: "This draft should not appear in the public collection." },
  },
];

export const fixtureRouteResolutions: Record<string, unknown> = {
  "/happenings/": {
    type: "happenings",
    data: entries,
    meta: {
      id: blueprint.id,
      type: "happenings",
      path: "/happenings/",
      blueprint,
    },
  },
  "/locations/fieldwork/community-supper/": {
    type: "happening",
    data: entries[0],
    meta: {
      id: entries[0].id,
      type: "happening",
      path: "/locations/fieldwork/community-supper/",
      blueprint,
    },
  },
};
