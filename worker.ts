// OpenNext generates this module during `cf:build`; it is intentionally not
// checked into source control. Keep the wrapper typed below without making
// the repository-wide TypeScript check depend on a generated build artifact.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- OpenNext creates the module during the Cloudflare build.
// @ts-ignore -- the generated OpenNext worker is present when Wrangler bundles.
import generatedWorker from "./.open-next/worker.js";
import { reconcileCloudflareBadgeHealth } from "./lib/cloudflareBadgeHealth";
import { dispatchQueuedCloudflareScan } from "./lib/cloudflareScheduledScan";
import type { PrivateDatabase } from "./lib/cloudflarePrivate";
import { isPublicRoutePath, isRscPrefetch } from "./lib/publicRequestPolicy";

type WorkerEnvironment = Record<string, unknown> & {
  ABSCISSA_REGISTRY?: D1Database;
  ABSCISSA_SCAN_DATA?: D1Database;
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
const publicRenders = new Map<string, Promise<Response>>();

function isPublicPage(request: Request): boolean {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (
    url.search ||
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

  return isPublicRoutePath(url.pathname);
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

async function renderPublicPage(
  request: Request,
  key: Request,
  env: WorkerEnvironment,
  ctx: WorkerContext,
): Promise<Response> {
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
}

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnvironment,
    ctx: WorkerContext,
  ): Promise<Response> {
    if (isRscPrefetch(request)) {
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "X-Abscissa-RSC-Prefetch": "bypassed",
        },
      });
    }
    if (!isPublicPage(request)) {
      return nextWorker.fetch(request, env, ctx);
    }

    const key = cacheKey(request);
    const cached = await edgeCache.match(key);
    if (cached) return withEdgeCacheHeaders(cached, "HIT");

    let render = publicRenders.get(key.url);
    if (!render) {
      render = renderPublicPage(request, key, env, ctx);
      publicRenders.set(key.url, render);
      void render.finally(() => {
        if (publicRenders.get(key.url) === render) publicRenders.delete(key.url);
      }).catch(() => undefined);
    }
    return (await render).clone();
  },
  async scheduled(
    controller: { scheduledTime: number; cron?: string },
    env: WorkerEnvironment,
  ): Promise<void> {
    const scanData = env.ABSCISSA_SCAN_DATA || env.ABSCISSA_REGISTRY;
    if (!scanData) return;
    if (controller.cron === "*/5 * * * *") {
      try {
        await dispatchQueuedCloudflareScan(
          env,
          scanData as unknown as PrivateDatabase,
        );
      } catch (error) {
        console.error(
          "[scheduled-deep-scan] dispatch failed",
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }
    await reconcileCloudflareBadgeHealth(scanData);
  },
};

export default worker;
