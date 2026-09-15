import { NextResponse } from "next/server";
import { getVersionScanProduct } from "@/lib/productData";
import { serverDb } from "@/lib/supabaseServer";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { userFromSession } from "@/lib/cloudflarePrivate";
import {
  createEvidenceReviewBrief,
  SarvamConfigurationError,
  SarvamOutputError,
  SarvamProviderError,
  type ReviewAudience,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;
const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; version: string; scanId: string }> },
) {
  const route = await context.params;
  const extensionId = decodeRoutePart(route.id);
  const version = decodeRoutePart(route.version);
  const scanId = decodeRoutePart(route.scanId);
  if (!isSafeIdentifier(extensionId, 220) || !isSafeIdentifier(version, 140) || !isSafeIdentifier(scanId, 140)) {
    return errorResponse("Invalid exact-release identity.", 400);
  }
  if (!sameOriginRequest(request)) return errorResponse("Cross-origin brief generation is not allowed.", 403);

  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return errorResponse("Request body too large.", 413);

  const cloudflare = cloudflarePrivateAvailable();
  let db: Awaited<ReturnType<typeof serverDb>> | undefined;
  let userId = "";
  if (cloudflare) {
    const user = await userFromSession(request);
    if (!user) return errorResponse("Sign in to generate an evidence brief.", 401, "auth_required");
    userId = user.id;
  } else {
    db = await serverDb();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return errorResponse("Sign in to generate an evidence brief.", 401, "auth_required");
    userId = user.id;
  }

  const bucketKey = `${userId}:${extensionId.toLowerCase()}:${version}`;
  const limit = checkRateLimit(bucketKey);
  if (!limit.allowed) {
    return new NextResponse(JSON.stringify({ error: "Brief generation is temporarily rate limited.", code: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Retry-After": String(limit.retryAfter) },
    });
  }

  const audience = await readAudience(request);
  if (!audience) return errorResponse("Unsupported review audience.", 400);

  const product = await getVersionScanProduct(extensionId, version, scanId, db, { skipCloudflareCatalog: true });
  const scan = product?.scan as Record<string, unknown> | null | undefined;
  if (!product || !scan || String(scan.id || "") !== scanId || String(scan.extension_id || "").toLowerCase() !== extensionId.toLowerCase() || String(scan.version || "") !== version) {
    return errorResponse("This exact report is not available.", 404);
  }
  if (String(scan.analysis_status || "") !== "complete" || !/^[a-f0-9]{64}$/i.test(String(scan.artifact_sha256 || ""))) {
    return errorResponse("A completed exact-artifact report is required.", 409);
  }

  try {
    const result = await createEvidenceReviewBrief({
      extensionId,
      version,
      scanId,
      scan,
      findings: asRecords(product.findings),
      dependencies: asRecords(product.dependencies),
    }, audience);
    return NextResponse.json({
      identity: {
        extension_id: extensionId,
        version,
        scan_id: scanId,
        artifact_sha256: String(scan.artifact_sha256).toLowerCase(),
      },
      deterministic_decision: String(scan.decision || "incomplete"),
      model: result.model,
      audience,
      ...result.brief,
    }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof SarvamConfigurationError) return errorResponse("Evidence briefs are not configured yet.", 503, "ai_unavailable");
    if (error instanceof SarvamProviderError && error.status === 429) return errorResponse("Sarvam is rate limiting this request. Try again shortly.", 429, "provider_rate_limited");
    if (error instanceof SarvamOutputError) return errorResponse("The evidence brief could not be verified and was not shown.", 502, "invalid_model_output");
    return errorResponse("Evidence brief generation is temporarily unavailable.", 502, "provider_unavailable");
  }
}

async function readAudience(request: Request): Promise<ReviewAudience | null> {
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  if (!raw.trim()) return "security_lead";
  try {
    const body = JSON.parse(raw) as { audience?: unknown };
    const audience = body?.audience;
    return audience === "security_lead" || audience === "engineer" || audience === "publisher" ? audience : null;
  } catch {
    return null;
  }
}

function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const previous = requestBuckets.get(key);
  if (!previous || previous.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (previous.count >= MAX_REQUESTS_PER_WINDOW) return { allowed: false, retryAfter: Math.ceil((previous.resetAt - now) / 1_000) };
  previous.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function decodeRoutePart(value: string): string {
  try { return decodeURIComponent(value); } catch { return ""; }
}

function isSafeIdentifier(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._+@-]*$/.test(value);
}

function sameOriginRequest(request: Request): boolean {
  const expected = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { expected.add(new URL(configured).origin); } catch { return false; }
  } else {
    try { expected.add(new URL(request.url).origin); } catch { return false; }
  }
  const origin = request.headers.get("origin")?.trim();
  if (origin) return expected.has(origin);
  const referer = request.headers.get("referer")?.trim();
  if (!referer) return false;
  try { return expected.has(new URL(referer).origin); } catch { return false; }
}

function errorResponse(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
