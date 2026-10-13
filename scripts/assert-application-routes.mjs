export const assertApplicationRoutesEmitted = (applicationPaths, htmlFiles) => {
  const emittedFiles = new Set(htmlFiles);
  const omittedPaths = [...new Set(applicationPaths.map(normalizeRoutePath))]
    .filter((path) => !emittedFiles.has(fileForRoute(path)));

  if (omittedPaths.length > 0) {
    throw new Error(`Built output omitted declared Astro-owned routes: ${omittedPaths.join(", ")}.`);
  }
};

const normalizeRoutePath = (value) => {
  if (
    !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("?")
    || value.includes("#")
    || value.includes("\\")
    || value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Site routes must be safe absolute paths: " + value);
  }

  const segments = value.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
};

const fileForRoute = (path) => {
  const decoded = decodeURIComponent(path);
  const relative = decoded.replace(/^\/+/, "");
  if (!relative) return "index.html";
  return `${relative}${relative.endsWith("/") ? "" : "/"}index.html`;
};
