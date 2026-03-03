function normalizeBasePath(basePath: string): string {
  if (basePath.length === 0) {
    return "/";
  }
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function inferBasePathFromModuleUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const moduleUrl = new URL(import.meta.url, window.location.href);
  const marker = "/assets/";
  const markerIndex = moduleUrl.pathname.indexOf(marker);
  if (markerIndex <= 0) {
    return null;
  }
  return normalizeBasePath(moduleUrl.pathname.slice(0, markerIndex));
}

export function resolvePublicAssetUrl(path: string): string {
  const envBase = normalizeBasePath(import.meta.env.BASE_URL ?? "/");
  const runtimeBase = envBase === "/" ? inferBasePathFromModuleUrl() ?? "/" : envBase;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${runtimeBase}${normalizedPath}`;
}
