import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const siteUrl = env.SITE_URL?.trim() || undefined;
const indexable = env.SITE_INDEXABLE === "true";

if (indexable && !siteUrl) {
  throw new Error("SITE_URL is required when SITE_INDEXABLE=true.");
}

if (indexable && new URL(siteUrl).protocol !== "https:") {
  throw new Error("SITE_URL must use HTTPS when SITE_INDEXABLE=true.");
}

export default defineConfig({
  site: siteUrl,
  output: "static",
  trailingSlash: "always",
  integrations: indexable ? [sitemap()] : [],
});
