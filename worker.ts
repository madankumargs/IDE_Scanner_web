// OpenNext generates this module during `cf:build`; it is intentionally not
// checked into source control. Keep the wrapper typed below without making
// the repository-wide TypeScript check depend on a generated build artifact.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- OpenNext creates the module during the Cloudflare build.
// @ts-ignore -- the generated OpenNext worker is present when Wrangler bundles.
import generatedWorker from "./.open-next/worker.js";
import { reconcileCloudflareBadgeHealth } from "./lib/cloudflareBadgeHealth";

type WorkerEnvironment = Record<string, unknown> & {
  ABSCISSA_REGISTRY?: D1Database;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type NextWorker = {
  fetch(
    request: Request,
    env: WorkerEnvironment,
    ctx: WorkerContext,
  ): Promise<Response>;
};

type CacheStorageWithDefault = CacheStorage & {
  default: Cache;
};

const nextWorker = generatedWorker as NextWorker;
const edgeCache = (
  globalThis as typeof globalThis & { caches: CacheStorageWithDefault }
).caches.default;

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

function isPublicPage(request: Request): boolean {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (
    url.search ||
    request.headers.has("cookie") ||
    request.headers.has("authorization")
  ) {
    return false;
  }

  // Next's RSC and prefetch requests can vary by router state and must not
  // share the document cache.
  if (
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("Next-Router-Segment-Prefetch")
  ) {
    return false;
  }

  if (url.pathname === "/") return true;
  if (!PUBLIC_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return false;
  }

  // Scan pages are authenticated and can be large; keep them on the normal
  // OpenNext path even though they share the /extensions/ prefix.
  return !url.pathname.includes("/scans/");
}

function cacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

function withEdgeCacheHeaders(response: Response, state: "HIT" | "MISS") {
  const headers = new Headers(response.headers);
  headers.set("X-Abscissa-Edge-Cache", state);

  if (state === "MISS") {
    headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnvironment,
    ctx: WorkerContext,
  ): Promise<Response> {
    if (!isPublicPage(request)) {
      return nextWorker.fetch(request, env, ctx);
    }

    const key = cacheKey(request);
    const cached = await edgeCache.match(key);
    if (cached) return withEdgeCacheHeaders(cached, "HIT");

    const response = await nextWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.status !== 200 ||
      !contentType.includes("text/html") ||
      response.headers.has("set-cookie")
    ) {
      return response;
    }

    const cacheableResponse = withEdgeCacheHeaders(response, "MISS");
    ctx.waitUntil(edgeCache.put(key, cacheableResponse.clone()));
    return cacheableResponse;
  },
  async scheduled(
    _controller: { scheduledTime: number },
    env: WorkerEnvironment,
  ): Promise<void> {
    if (!env.ABSCISSA_REGISTRY) return;
    await reconcileCloudflareBadgeHealth(env.ABSCISSA_REGISTRY);
  },
};

export default worker;
