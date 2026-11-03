import type { APIRoute } from "astro";

const allowedCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
] as const;

const disallowedCrawlers = ["CCBot", "Bytespider"] as const;

const robotGroup = (agent: string, directive: "Allow" | "Disallow"): string =>
  `User-agent: ${agent}\n${directive}: /`;

export const renderRobotsTxt = (indexable: boolean, sitemap: string | null): string => {
  if (!indexable) return "User-agent: *\nDisallow: /\n";

  const groups = [
    robotGroup("*", "Allow"),
    ...allowedCrawlers.map((agent) => robotGroup(agent, "Allow")),
    ...disallowedCrawlers.map((agent) => robotGroup(agent, "Disallow")),
  ];
  const body = groups.join("\n\n");
  return sitemap ? `${body}\n\nSitemap: ${sitemap}\n` : `${body}\n`;
};

export const GET: APIRoute = ({ site }) => {
  const indexable = import.meta.env.SITE_INDEXABLE === "true";
  const sitemap = indexable && site ? new URL("sitemap-index.xml", site).href : null;

  return new Response(renderRobotsTxt(indexable, sitemap), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
