export const defaultPageLayoutSlug = "starter-astro-standard-page";

export const pageLayoutDefinitions = [
  {
    name: "Starter Astro Standard Page",
    slug: defaultPageLayoutSlug,
    schema: {
      fields: [
        {
          name: "Content width",
          slug: "content_width",
          type: "select",
          order: 0,
          options: [
            { label: "Narrow", value: "narrow" },
            { label: "Standard", value: "standard" },
            { label: "Wide", value: "wide" },
          ],
        },
        {
          name: "Section spacing",
          slug: "section_spacing",
          type: "select",
          order: 1,
          options: [
            { label: "Compact", value: "compact" },
            { label: "Comfortable", value: "comfortable" },
            { label: "Spacious", value: "spacious" },
          ],
        },
      ],
    },
  },
];

export const resolvePageLayoutSlug = (
  assignedSlug: string | null | undefined,
  rendererSlugs: readonly string[],
): string => {
  const slug = assignedSlug?.trim() || defaultPageLayoutSlug;

  if (!rendererSlugs.includes(slug)) {
    throw new Error(
      `Backstage page layout "${slug}" has no Astro renderer. Add a page layout component before building.`,
    );
  }

  return slug;
};
