import { NextResponse } from "next/server";
import { getVersionScanProduct } from "@/lib/productData";
import { serverDb } from "@/lib/supabaseServer";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { privateDb, userFromSession } from "@/lib/cloudflarePrivate";
import {
  compileEvidenceIntelligenceContext,
  type IntelligenceAudience,
  type IntelligenceDepth,
} from "@/lib/evidenceIntelligence";
import {
  createEvidenceIntelligenceReport,
  SarvamConfigurationError,
  SarvamOutputError,
  SarvamProviderError,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;
const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 3;
const localRequestBuckets = new Map<string, { count: number; resetAt: number }>();

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
  if (!sameOriginRequest(request)) return errorResponse("Cross-origin intelligence generation is not allowed.", 403);

  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return errorResponse("Request body too large.", 413);

  const cloudflare = cloudflarePrivateAvailable();
  let db: Awaited<ReturnType<typeof serverDb>> | undefined;
  let userId = "";
  if (cloudflare) {
    const user = await userFromSession(request);
    if (!user) return errorResponse("Sign in to generate an intelligence report.", 401, "auth_required");
    userId = user.id;
  } else {
    db = await serverDb();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return errorResponse("Sign in to generate an intelligence report.", 401, "auth_required");
    userId = user.id;
  }

  const options = await readOptions(request);
  if (!options) return errorResponse("Unsupported intelligence review options.", 400);
  if (process.env.SARVAM_INTELLIGENCE_REPORT_ENABLED?.trim().toLowerCase() === "false") {
    return errorResponse("Evidence intelligence is temporarily disabled.", 503, "ai_disabled");
  }

  const limit = await checkRateLimit(userId, cloudflare);
  if (!limit.allowed) {
    return new NextResponse(JSON.stringify({ error: "Intelligence generation is temporarily rate limited.", code: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Retry-After": String(limit.retryAfter) },
    });
  }

  const product = await getVersionScanProduct(extensionId, version, scanId, db, { compact: true, includePreviews: false, skipCloudflareCatalog: true });
  const scan = product?.scan as Record<string, unknown> | null | undefined;
  if (!product || !scan || String(scan.id || "") !== scanId || String(scan.extension_id || "").toLowerCase() !== extensionId.toLowerCase() || String(scan.version || "") !== version) {
    return errorResponse("This exact report is not available.", 404);
  }
  if (String(scan.analysis_status || "") !== "complete" || !/^[a-f0-9]{64}$/i.test(String(scan.artifact_sha256 || ""))) {
    return errorResponse("A completed exact-artifact report is required.", 409);
  }

  try {
    const evidence = compileEvidenceIntelligenceContext({
      ...product,
      scan,
    });
    const result = await createEvidenceIntelligenceReport(evidence, options.audience, options.depth);
    return NextResponse.json(result.report, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    if (error instanceof SarvamConfigurationError) return errorResponse("Evidence intelligence is not configured yet.", 503, "ai_unavailable");
    if (error instanceof SarvamProviderError && error.status === 429) return errorResponse("Sarvam is rate limiting this request. Try again shortly.", 429, "provider_rate_limited");
    if (error instanceof SarvamOutputError) return errorResponse("The intelligence report could not be evidence-verified and was not shown.", 502, "invalid_model_output");
    console.warn("[evidence-intelligence] generation failed", { error: error instanceof Error ? error.name : "unknown" });
    return errorResponse("Evidence intelligence generation is temporarily unavailable.", 502, "provider_unavailable");
  }
}

async function readOptions(request: Request): Promise<{ audience: IntelligenceAudience; depth: IntelligenceDepth } | null> {
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  if (!raw.trim()) return { audience: "security_lead", depth: "standard" };
  try {
    const body = JSON.parse(raw) as { audience?: unknown; depth?: unknown };
    const audience = body?.audience;
    const depth = body?.depth || "standard";
    if ((audience !== "security_lead" && audience !== "engineer" && audience !== "publisher") || depth !== "standard") return null;
    return { audience, depth };
  } catch {
    return null;
  }
}

async function checkRateLimit(userId: string, cloudflare: boolean): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  if (cloudflare) {
    const db = privateDb();
    const nowIso = new Date(now).toISOString();
    const windowStartIso = new Date(now - WINDOW_MS).toISOString();
    await db.prepare(`
      INSERT INTO app_ai_usage(user_id,feature,window_started_at,request_count,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(user_id,feature) DO UPDATE SET
        request_count=CASE WHEN app_ai_usage.window_started_at<? THEN 1 ELSE app_ai_usage.request_count+1 END,
        window_started_at=CASE WHEN app_ai_usage.window_started_at<? THEN excluded.window_started_at ELSE app_ai_usage.window_started_at END,
        updated_at=excluded.updated_at
    `).bind(userId, "evidence_intelligence", nowIso, 1, nowIso, windowStartIso, windowStartIso).run();
    const row = await db.prepare("SELECT request_count,window_started_at FROM app_ai_usage WHERE user_id=? AND feature=? LIMIT 1").bind(userId, "evidence_intelligence").first<Record<string, unknown>>();
    const count = Number(row?.request_count || 0);
    const windowStartedAt = Date.parse(String(row?.window_started_at || nowIso));
    if (count > MAX_REQUESTS_PER_WINDOW) return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowStartedAt + WINDOW_MS - now) / 1_000)) };
    return { allowed: true, retryAfter: 0 };
  }
  const key = `local:${userId}`;
  const previous = localRequestBuckets.get(key);
  if (!previous || previous.resetAt <= now) {
    localRequestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (previous.count >= MAX_REQUESTS_PER_WINDOW) return { allowed: false, retryAfter: Math.ceil((previous.resetAt - now) / 1_000) };
  previous.count += 1;
  return { allowed: true, retryAfter: 0 };
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
