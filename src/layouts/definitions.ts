import { parseLayoutManifest } from "@antlur/backstage/layouts/manifest";
import standardPageLayoutManifest from "./standard-page/manifest.json" with { type: "json" };

const standardPageLayout = parseLayoutManifest(standardPageLayoutManifest);

export const defaultPageLayoutSlug = standardPageLayout.slug;
export const pageLayoutDefinitions = [standardPageLayout];

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
