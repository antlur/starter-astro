import type { HeadlessPage, HeadlessWebsite } from "./backstage/content";
import { richTextToPlainText } from "./sanitize-rich-text";

type SeoPage = Pick<HeadlessPage, "title" | "is_home" | "meta" | "blocks">;
type SeoSite = Pick<HeadlessWebsite, "name" | "meta" | "openGraph">;

const plainText = (value?: string | null): string => richTextToPlainText(value ?? "");

const pageContentDescription = (page?: SeoPage): string => {
  for (const block of page?.blocks ?? []) {
    for (const value of [block.fields.description, block.fields.intro, block.fields.subtitle, block.fields.body, block.fields.text, block.fields.content, block.menu?.subtitle]) {
      if (typeof value !== "string") continue;
      const text = plainText(value);
      if (!text) continue;
      if (text.length <= 160) return text;

      const shortened = text.slice(0, 157).replace(/\s+\S*$/, "").trimEnd();
      return `${shortened || text.slice(0, 157)}...`;
    }
  }

  return "";
};

export const resolveSeoMetadata = ({
  page,
  routeTitle,
  routeDescription,
  site,
}: {
  page?: SeoPage;
  routeTitle?: string | null;
  routeDescription?: string | null;
  site: SeoSite;
}) => {
  const siteTitle = plainText(site.meta?.title) || plainText(site.name);
  const pageTitle = plainText(routeTitle) || plainText(page?.meta?.title) || plainText(page?.title) || siteTitle;
  const title = pageTitle === siteTitle || pageTitle.endsWith(` | ${siteTitle}`) ? pageTitle : `${pageTitle} | ${siteTitle}`;
  const contentDescription = pageContentDescription(page);
  const pageDescription = plainText(routeDescription) || plainText(page?.meta?.description) || contentDescription;
  const description = pageDescription || plainText(site.openGraph?.description) || plainText(site.meta?.description) || pageTitle;

  return {
    title,
    description,
    openGraphTitle: plainText(routeTitle) || plainText(page?.meta?.title) || (page?.is_home ? plainText(site.openGraph?.title) : "") || title,
    openGraphDescription: pageDescription || plainText(site.openGraph?.description) || description,
  };
};
