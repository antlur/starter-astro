const isToken = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && !/[^\x21-\x7e]/.test(value);

export const redirectPathKey = (path: string): string => {
  if (!isToken(path) || !path.startsWith("/") || path.includes("//")) {
    throw new Error("Use a single, root-relative URL path.");
  }

  const segments = path.slice(1).split("/").map((segment) => decodeURIComponent(segment));
  if (segments.some((segment) => segment === "." || segment === ".."
    || /[\/\\?#*:\x00-\x1f\x7f]|%[a-f\d]{2}/i.test(segment))) {
    throw new Error("Use an exact path without special routing syntax or ambiguous encoding.");
  }

  return "/" + segments.join("/").replace(/\/$/, "");
};

const urlHost = (url: URL) => url.hostname.replace(/^www\./, "").replace(/\.$/, "");

const destinationKey = (target: string, site: URL): string | null => {
  if (!isToken(target) || /[\\*]|[/?&#=]:[a-z_]/i.test(target)) {
    throw new Error("Destination must be a path or HTTP(S) URL without routing syntax.");
  }
  if (target.startsWith("/")) return redirectPathKey(target.split(/[?#]/, 1)[0]);
  if (!/^https?:\/\/[^/?#]/i.test(target)) throw new Error("Only HTTP(S) destinations are supported.");

  const url = new URL(target);
  if (url.username || url.password) throw new Error("Destination must not include credentials.");
  return urlHost(url) === urlHost(site) ? redirectPathKey(url.pathname) : null;
};

type RedirectBuildOptions = {
  accountId: string;
  siteUrl: string;
  existingPaths: ReadonlySet<string>;
};

export const renderBackstageRedirects = (rows: unknown, { accountId, siteUrl, existingPaths }: RedirectBuildOptions): string => {
  if (!Array.isArray(rows)) throw new Error("Backstage did not return a redirect list.");
  if (rows.length > 2_000) throw new Error("The static build supports up to 2,000 managed redirects.");

  const site = new URL(siteUrl);
  if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) {
    throw new Error("Redirect publishing needs an HTTP(S) SITE_URL without credentials.");
  }

  const sources = new Set<string>();
  const rules = rows.map((row, index) => {
    try {
      if (!row || row.account_id !== accountId) throw new Error("Rule belongs to a different account.");
      const { source_url: source, target_url: target, status_code: status } = row;
      const key = redirectPathKey(source);
      if (key === "/" || /^\/(?:_redirects|_headers|_astro|api)(?:\/|$)/i.test(key)) {
        throw new Error("Source is reserved by the site or host.");
      }
      if (sources.has(key)) throw new Error("Duplicate redirect source.");
      if (existingPaths.has(key)) throw new Error("Source conflicts with an existing built page or asset.");
      if (status !== 301 && status !== 302) throw new Error("Only 301 and 302 statuses are supported.");

      const destination = destinationKey(target, site);
      const line = source + " " + target + " " + status;
      if (line.length > 1_000) throw new Error("Rule exceeds the 1,000-character host limit.");
      sources.add(key);
      return { destination, line };
    } catch (error) {
      // Do not print raw destinations: query parameters can contain sensitive values.
      const message = error instanceof Error && !(error instanceof URIError) && !(error instanceof TypeError)
        ? error.message
        : "Invalid URL path or destination.";
      throw new Error("Backstage redirect " + (index + 1) + ": " + message);
    }
  });

  return rules.map(({ line, destination }, index) => {
    if (destination !== null && sources.has(destination)) {
      throw new Error("Backstage redirect " + (index + 1) + ": destination is also a redirect source. Point directly to the final URL.");
    }
    return line + "\n";
  }).join("");
};
