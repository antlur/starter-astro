import type { Alert } from "@antlur/backstage";

const normalizedPath = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const path = new URL(value.trim(), "https://starter.invalid").pathname;
    const decoded = decodeURIComponent(path);
    return decoded === "/" ? "/" : `/${decoded.split("/").filter(Boolean).join("/")}/`;
  } catch {
    return null;
  }
};

const isWithinSchedule = (alert: Alert, now: number): boolean => {
  const start = alert.start_at ? Date.parse(alert.start_at) : null;
  const end = alert.end_at ? Date.parse(alert.end_at) : null;

  return (start === null || (Number.isFinite(start) && start <= now))
    && (end === null || (Number.isFinite(end) && end >= now));
};

export const alertsForPath = (alerts: readonly Alert[], pathname: string, now = Date.now()): Alert[] => {
  const currentPath = normalizedPath(pathname);
  if (!currentPath) return [];

  return alerts.filter((alert) => {
    if (alert.published !== true || !isWithinSchedule(alert, now)) return false;
    if (alert.is_global === true || alert.target_mode === "all") return true;

    const paths = [
      ...(alert.targets ?? []).flatMap((target) => target.path ? [target.path] : target.type === "path" ? [target.value] : []),
      ...(alert.pages ?? []).flatMap((page) => [page.path, page.slug]),
    ];

    return paths.some((path) => normalizedPath(path) === currentPath);
  });
};
