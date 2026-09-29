import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const canIndex = import.meta.env.SITE_INDEXABLE === "true" && Boolean(site);
  const sitemap = canIndex && site ? new URL("sitemap-index.xml", site).href : null;
  const content = canIndex
    ? "User-agent: *\nAllow: /\n" + (sitemap ? "\nSitemap: " + sitemap + "\n" : "")
    : "User-agent: *\nDisallow: /\n";

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
