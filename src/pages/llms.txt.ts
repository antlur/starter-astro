import type { APIRoute } from "astro";
import { isPublicLocation, type SiteLocation } from "../lib/backstage/locations";
import type { SiteMenu } from "../lib/backstage/menus";
import { getSiteBuild } from "../site/build";

interface LlmsRoutePlan {
  locationRoutes: readonly { path: string; location: Pick<SiteLocation, "name" | "isPublic" | "status"> }[];
  locationIndexPaths: readonly string[];
  menuRoutes: readonly { path: string; label: string; menu: Pick<SiteMenu, "title" | "isPublished"> }[];
  menuIndexPaths: readonly string[];
}

export interface LlmsLink {
  label: string;
  url: string;
}

const markdownLabel = (value: string): string => value.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim() || "Link";

const absoluteUrl = (site: URL | undefined, path: string): string | null => {
  if (!site) return null;
  try {
    return new URL(path, site).href;
  } catch {
    return null;
  }
};

const linkFor = (site: URL | undefined, path: string, label: string): LlmsLink | null => {
  const url = absoluteUrl(site, path);
  if (!url) return null;
  return { label: markdownLabel(label), url };
};

const uniqueLinks = (links: readonly LlmsLink[]): LlmsLink[] => {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
};

export const collectLlmsLinks = (
  site: URL | undefined,
  routePlan: LlmsRoutePlan,
): { locations: LlmsLink[]; menus: LlmsLink[] } => ({
  locations: uniqueLinks([
    ...routePlan.locationIndexPaths.flatMap((path) => {
      const link = linkFor(site, path, "Locations");
      return link ? [link] : [];
    }),
    ...routePlan.locationRoutes.flatMap((route) => {
      if (!isPublicLocation(route.location)) return [];
      const link = linkFor(site, route.path, route.location.name);
      return link ? [link] : [];
    }),
  ]),
  menus: uniqueLinks([
    ...routePlan.menuIndexPaths.flatMap((path) => {
      const link = linkFor(site, path, "Menus");
      return link ? [link] : [];
    }),
    ...routePlan.menuRoutes.flatMap((route) => {
      if (route.menu.isPublished === false) return [];
      const link = linkFor(site, route.path, route.label || route.menu.title);
      return link ? [link] : [];
    }),
  ]),
});

export const renderLlmsTxt = ({
  name,
  description,
  locations,
  menus,
}: {
  name: string;
  description?: string | null;
  locations: readonly LlmsLink[];
  menus: readonly LlmsLink[];
}): string => {
  const title = name.replace(/\s+/g, " ").trim() || "Website";
  const summary = (description ?? "").replace(/\s+/g, " ").trim();
  const lines = [`# ${title}`];
  if (summary) lines.push("", `> ${summary}`);

  const section = (heading: string, links: readonly LlmsLink[]) => {
    if (links.length === 0) return;
    lines.push("", `## ${heading}`, "");
    for (const link of links) lines.push(`- [${link.label}](${link.url})`);
  };

  section("Locations", locations);
  section("Menus", menus);
  lines.push("");
  return lines.join("\n");
};

export const GET: APIRoute = async ({ site }) => {
  const { content, routePlan } = await getSiteBuild();
  const { locations, menus } = collectLlmsLinks(site, routePlan);
  const description = content.site.meta?.description || content.site.openGraph?.description;

  return new Response(renderLlmsTxt({
    name: content.site.name,
    description,
    locations,
    menus,
  }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
