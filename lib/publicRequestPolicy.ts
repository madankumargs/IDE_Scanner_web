const PUBLIC_PAGE_PREFIXES = [
  "/about",
  "/benchmark",
  "/catalog",
  "/changelog",
  "/contact",
  "/detections",
  "/docs",
  "/extensions/",
  "/integrations",
  "/metrics",
  "/pricing",
  "/publishers/",
  "/registry",
  "/research/",
  "/security",
  "/status",
  "/terms",
];

export function isPublicRoutePath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (!PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }

  // Scan reports can contain user-owned data and must stay on the normal
  // OpenNext path, even though they share the /extensions/ prefix.
  return !pathname.includes("/scans/");
}

/**
 * Next sends these requests only to warm client-side navigation. They do not
 * carry the document needed to render the current page, so a failed prefetch
 * must never become a user-visible 1102 or consume the Worker CPU budget.
 */
export function isRscPrefetch(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  if (!request.headers.has("RSC")) return false;
  if (
    !request.headers.has("Next-Router-Prefetch") &&
    !request.headers.has("Next-Router-Segment-Prefetch")
  ) {
    return false;
  }
  const pathname = new URL(request.url).pathname;
  return !pathname.startsWith("/api/");
}
