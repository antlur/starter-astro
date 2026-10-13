import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import applicationRoutePaths from "../src/site/application-route-paths.json" with { type: "json" };
import { assertApplicationRoutesEmitted } from "./assert-application-routes.mjs";

const mode = process.argv[2];

if (mode !== "preview" && mode !== "indexable") {
  throw new Error("Pass either 'preview' or 'indexable'.");
}

const dist = resolve("dist");
const siteUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
const baseUrl = siteUrl || new URL("https://starter.example");
const files = listFiles(dist);
const htmlFiles = files.filter((file) => file.endsWith(".html"));

assertApplicationRoutesEmitted(applicationRoutePaths, htmlFiles);
assert.ok(htmlFiles.includes("index.html"), "The built site must include its home page.");
assert.ok(htmlFiles.length > 0, "The build must contain rendered HTML pages.");

const canonicalUrls = [];

for (const file of htmlFiles) {
  const html = readFileSync(resolve(dist, file), "utf8");
  const routePath = routeForFile(file);
  const title = html.match(/<title>(.*?)<\/title>/is)?.[1];
  const robotsTag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0];
  const robots = robotsTag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];

  assert.ok(title?.trim(), `${file} must render a document title.`);
  assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i, `${file} must declare its document language.`);
  assert.match(html, /<a\b[^>]*\bhref=["']#main-content["'][^>]*>[\s\S]*?Skip to content/i, `${file} must render the skip link.`);
  assert.match(html, /<main\b[^>]*\bid=["']main-content["']/i, `${file} must render the main landmark.`);
  assert.ok(robots, `${file} must render a robots directive.`);

  if (mode === "preview") {
    assert.match(robots, /noindex\s*,\s*nofollow/i, `${file} must remain noindex in preview builds.`);
  } else {
    assert.match(robots, /index\s*,\s*follow/i, `${file} must be indexable in production builds.`);
    const canonicalTag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
    const canonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];

    assert.ok(canonical, `${file} must include a canonical URL.`);
    const canonicalUrl = new URL(canonical);
    assert.equal(canonicalUrl.origin, baseUrl.origin, `${file} canonical URL must use the configured site origin.`);
    assert.equal(canonicalUrl.href, new URL(routePath, baseUrl).href, `${file} canonical URL must match its rendered route.`);
    canonicalUrls.push(canonicalUrl.href);
  }

  for (const imageTag of html.matchAll(/<img\b[^>]*>/gi)) {
    assert.match(imageTag[0], /\balt=["'][^"']*["']/i, `${file} contains an image without an alt attribute.`);
  }

  for (const anchor of html.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>/gi)) {
    const href = decodeEntities(anchor[2].trim());
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;

    const link = new URL(href, new URL(routePath, baseUrl));
    if (link.origin !== baseUrl.origin) continue;

    const target = fileForPath(link.pathname);
    assert.ok(existsSync(resolve(dist, target)), `${file} links to missing local output: ${href}`);
  }
}

const robotsTxt = readFileSync(resolve(dist, "robots.txt"), "utf8");

if (mode === "preview") {
  assert.match(robotsTxt, /Disallow:\s*\//i, "Preview robots.txt must block crawling.");
  assert.doesNotMatch(robotsTxt, /^Sitemap:/im, "Preview robots.txt must not advertise a sitemap.");
  assert.equal(files.some((file) => /^sitemap.*\.xml$/i.test(file)), false, "Preview builds must not emit a sitemap.");
} else {
  assert.doesNotMatch(robotsTxt, /Disallow:\s*\//i, "Indexable robots.txt must not block crawling.");
  assert.match(robotsTxt, new RegExp(`Sitemap:\\s*${escapeRegExp(new URL("sitemap-index.xml", baseUrl).href)}`, "i"));

  const sitemapFiles = files.filter((file) => /^sitemap.*\.xml$/i.test(file));
  assert.ok(sitemapFiles.length > 0, "Indexable builds must emit a sitemap.");
  const sitemapUrls = new Set(
    sitemapFiles.flatMap((file) => [...readFileSync(resolve(dist, file), "utf8").matchAll(/<loc>(.*?)<\/loc>/gi)].map((match) => decodeEntities(match[1])))
  );

  for (const canonical of canonicalUrls) {
    assert.ok(sitemapUrls.has(canonical), `The sitemap must include ${canonical}.`);
  }
}

const publicText = files
  .filter((file) => /\.(?:html|js|css|json|txt|xml)$/i.test(file))
  .map((file) => readFileSync(resolve(dist, file), "utf8"))
  .join("\n");
assert.doesNotMatch(publicText, /BACKSTAGE_API_KEY/, "Server-only credential names must not ship in public assets.");
if (process.env.BACKSTAGE_API_KEY) {
  assert.equal(publicText.includes(process.env.BACKSTAGE_API_KEY), false, "The Backstage API key must not ship in public assets.");
}

console.log(`Built ${mode} site checks passed for ${htmlFiles.length} routes.`);

function listFiles(directory, parent = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = parent ? `${parent}${sep}${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(resolve(directory, entry.name), relative) : [relative.split(sep).join("/")];
  });
}

function routeForFile(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file.slice(0, -".html".length)}`;
}

function fileForPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, "");
  if (!relative || decoded.endsWith("/")) return `${relative}${relative && !relative.endsWith("/") ? "/" : ""}index.html`;
  return relative;
}

function decodeEntities(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
