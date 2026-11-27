import { BackstageClient } from "@antlur/backstage";
import type { AstroIntegration } from "astro";
import { appendFile, lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { redirectPathKey, renderBackstageRedirects } from "../lib/backstage/redirects";

const builtPaths = async (dir: URL): Promise<Set<string>> => {
  const paths = new Set<string>();
  for (const file of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() && !file.isSymbolicLink()) continue;
    const path = "/" + relative(fileURLToPath(dir), join(file.parentPath, file.name))
      .split(sep).map(encodeURIComponent).join("/");
    const aliases = [path];
    if (path.endsWith("/index.html")) aliases.push(path.slice(0, -"index.html".length));
    if (path.endsWith(".html")) aliases.push(path.slice(0, -".html".length));
    for (const alias of aliases) {
      try {
        paths.add(redirectPathKey(alias));
      } catch {
        // Files outside the exact-path syntax cannot be a managed source.
      }
    }
  }
  return paths;
};

export const publishBackstageRedirects = (env: Record<string, string | undefined>): AstroIntegration => ({
  name: "backstage-redirects",
  hooks: {
    "astro:build:done": async ({ dir, logger }) => {
      if (env.BACKSTAGE_SOURCE !== "api" || env.BACKSTAGE_REDIRECTS_ENABLED !== "true") return;

      const token = env.BACKSTAGE_API_KEY;
      const accountId = env.BACKSTAGE_ACCOUNT_ID;
      const siteUrl = env.SITE_URL?.trim();
      if (!token || !accountId || !siteUrl) {
        throw new Error("Backstage redirects require SITE_URL and the site's read-only Backstage build credentials.");
      }

      const client = new BackstageClient({
        token, accountId, baseURL: env.BACKSTAGE_API_URL || "https://bckstg.app/api",
      });
      const redirects = await client.redirects.getRedirects({ signal: AbortSignal.timeout(15_000) });
      if (Array.isArray(redirects) && redirects.length === 0) return;

      const rules = renderBackstageRedirects(redirects, { accountId, siteUrl, existingPaths: await builtPaths(dir) });
      const output = new URL("_redirects", dir);
      const existingFile = await lstat(output).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (existingFile && !existingFile.isFile()) {
        throw new Error("The build's _redirects output must be a regular file.");
      }
      const existing = existingFile ? await readFile(output, "utf8") : "";
      // Site-owned rules keep their position and first-match priority.
      await appendFile(output, (existing && !existing.endsWith("\n") ? "\n" : "") + rules);
      logger.info("Published Backstage redirects to _redirects.");
    },
  },
});
