const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLocalPath = (value: string): boolean =>
  value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
const staticFileExtension = /\.(?:7z|avif|bmp|bin|css|csv|docx?|eot|gif|gz|heic|heif|ico|jpe?g|js|json|m4a|m4v|mov|mp3|mp4|mpeg|ogg|otf|pdf|png|pptx?|rar|rtf|svg|tar|tif|tiff|txt|wav|webm|webmanifest|webp|woff2?|xlsx?|xml|zip)$/i;

const normalizedHostname = (value: string): string | null => {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

export const previewRouteUrl = (
  value: unknown,
  siteDomain: string | null | undefined,
  routePaths: readonly string[],
): string | null => {
  if (typeof value !== "string" || !siteDomain) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const siteHostname = normalizedHostname(siteDomain);
    if (!siteHostname || normalizedHostname(url.href) !== siteHostname) return null;

    const canonicalPath = url.pathname === "/" ? "/" : `/${url.pathname.split("/").filter(Boolean).join("/")}/`;
    const normalizedRoutePaths = [...new Set(routePaths.map((path) =>
      path === "/" ? "/" : `/${path.split("/").filter(Boolean).join("/")}/`,
    ))].map((path) => ({ path, exact: path === canonicalPath }));
    const exactPath = normalizedRoutePaths.find(({ exact }) => exact)?.path;
    const terminalSlug = canonicalPath.split("/").filter(Boolean).at(-1);
    const terminalMatches = terminalSlug
      ? normalizedRoutePaths.filter(({ path }) => path.split("/").filter(Boolean).at(-1) === terminalSlug)
      : [];
    const matchedPath = exactPath ?? (terminalMatches.length === 1 ? terminalMatches[0].path : null);

    return matchedPath ? `${matchedPath}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
};

export const safeLinkUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (isLocalPath(url) || url.startsWith("#")) return url;

  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
};

export const safeSiteLinkUrl = (value: unknown): string | null => {
  const safeUrl = safeLinkUrl(value);
  if (!safeUrl || !isLocalPath(safeUrl)) return safeUrl;

  const url = new URL(safeUrl, "https://starter.invalid");
  const finalSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  // Static asset paths keep their filename; page paths match Astro's trailing-slash routes.
  if (staticFileExtension.test(finalSegment)) return safeUrl;

  const pathname = url.pathname === "/" ? "/" : `/${url.pathname.split("/").filter(Boolean).join("/")}/`;
  return `${pathname}${url.search}${url.hash}`;
};

export const safeImageUrl = (value: unknown): string | null => {
  const url = (typeof value === "string" ? value : isRecord(value) ? value.url : "");
  if (typeof url !== "string" || !url.trim()) return null;
  const normalized = url.trim();
  if (isLocalPath(normalized)) return normalized;

  try {
    return ["http:", "https:"].includes(new URL(normalized).protocol) ? normalized : null;
  } catch {
    return null;
  }
};

export const safeVideoUrl = (value: unknown): string | null => {
  const media = isRecord(value) ? value : null;
  const rawUrl = typeof value === "string" ? value : media?.url;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  const normalized = safeImageUrl(rawUrl.trim());
  if (!normalized) return null;

  let pathname: string;
  try {
    pathname = new URL(normalized, "https://starter.invalid").pathname;
  } catch {
    return null;
  }

  const providedName = typeof media?.file_name === "string" ? media.file_name.trim() : "";
  const fileName = providedName || pathname.split("/").at(-1) || "";
  return /\.(?:mp4|webm|ogv|ogg)$/i.test(fileName) ? normalized : null;
};

export const safeAltText = (value: unknown): string => {
  const alt = typeof value === "string" ? value.trim() : "";

  return /\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(alt) ? "" : alt;
};

export const mediaAltText = (value: unknown): string =>
  safeAltText(isRecord(value) && typeof value.alt === "string" ? value.alt : "");
