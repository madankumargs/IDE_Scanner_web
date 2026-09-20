import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { isTransientScanCallbackError } from "@/lib/scanCallbackError";
import { incompleteArtifactReason, ingestScanBundle } from "@/lib/scanIngest";
import { serviceDb } from "@/lib/supabase";
import { cloudflarePrivateAvailable, failCloudflareScan, saveCloudflareScanResult } from "@/lib/cloudflareDeepScan";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_CALLBACK_BYTES = 10 * 1024 * 1024;
const MAX_DECODED_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_CALLBACK_BYTES) return NextResponse.json({ error: "Scan callback payload is too large." }, { status: 413 });
  let body: Buffer;
  try {
    body = await readBoundedBody(request, MAX_CALLBACK_BYTES);
  } catch {
    return NextResponse.json({ error: "Scan callback payload is too large." }, { status: 413 });
  }
  const secret = runtimeEnv("SCAN_CALLBACK_SECRET");
  const supplied = request.headers.get("x-ide-scanner-signature") || "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ error: "Invalid scan callback signature." }, { status: 401 });
  let receiptId = "";
  let callbackJobId = "";
  try {
    const encoding = request.headers.get("content-encoding");
    if (encoding && encoding !== "identity" && encoding !== "gzip") {
      return NextResponse.json({ error: "Unsupported scan callback content encoding." }, { status: 415 });
    }
    let decoded: string;
    try {
      decoded = encoding === "gzip"
        ? gunzipSync(body, { maxOutputLength: MAX_DECODED_BYTES }).toString("utf8")
        : body.toString("utf8");
    } catch (error) {
      if (isOversizedDecodedPayload(error)) {
        return NextResponse.json({ error: "Decoded scan callback payload is too large." }, { status: 413 });
      }
      return NextResponse.json({ error: "Scan callback compression is invalid." }, { status: 400 });
    }
    if (Buffer.byteLength(decoded) > MAX_DECODED_BYTES) return NextResponse.json({ error: "Decoded scan callback payload is too large." }, { status: 413 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return NextResponse.json({ error: "Scan callback payload is not valid JSON." }, { status: 400 });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Scan callback payload must be an object." }, { status: 400 });
    }
    const payload = parsed as { job_id?: unknown; bundle?: unknown; error?: unknown };
    if (typeof payload.job_id !== "string" || !payload.job_id) return NextResponse.json({ error: "job_id is required." }, { status: 400 });
    if (payload.error !== undefined && typeof payload.error !== "string") {
      return NextResponse.json({ error: "error must be a string." }, { status: 400 });
    }
    if (payload.error === undefined && (!payload.bundle || typeof payload.bundle !== "object" || Array.isArray(payload.bundle))) {
      return NextResponse.json({ error: "bundle is required for a completed scan." }, { status: 400 });
    }
    callbackJobId = payload.job_id;
    if (cloudflarePrivateAvailable()) {
      if (payload.error !== undefined) {
        await failCloudflareScan(payload.job_id, String(payload.error));
        return NextResponse.json({ status: "failed" });
      }
      const scanId = await saveCloudflareScanResult(payload.job_id, payload.bundle as Record<string, unknown>);
      return NextResponse.json({ scan_id: scanId });
    }
    const db = serviceDb();
    const job = await db.from("scan_jobs").select("id,extension_id,version").eq("id", payload.job_id).maybeSingle();
    if (job.error) throw job.error;
    if (!job.data) return NextResponse.json({ error: "Scan job was not found." }, { status: 404 });
    const receipt = await db.rpc("begin_scan_callback", {
      p_job_id: payload.job_id,
      p_payload_sha256: createHash("sha256").update(body).digest("hex"),
    });
    if (receipt.error) throw receipt.error;
    receiptId = typeof receipt.data === "string" ? receipt.data : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) {
      throw new Error("Callback receipt did not return a valid identity.");
    }
    if (payload.error !== undefined) {
      const finalized = await db.rpc("finish_scan_callback", {
        p_job_id: payload.job_id,
        p_receipt_id: receiptId,
        p_result: "worker_failed",
        p_error: payload.error,
      });
      if (finalized.error) throw finalized.error;
      return NextResponse.json({ status: "failed" });
    }
    const bundle = payload.bundle as Record<string, unknown>;
    const acquisitionFailure = incompleteArtifactReason(bundle);
    if (acquisitionFailure) {
      const finalized = await db.rpc("finish_scan_callback", {
        p_job_id: payload.job_id,
        p_receipt_id: receiptId,
        p_result: "artifact_incomplete",
        p_error: acquisitionFailure,
      });
      if (finalized.error) throw finalized.error;
      return NextResponse.json({ status: "incomplete", reason: acquisitionFailure });
    }
    const scanId = await ingestScanBundle(payload.job_id, bundle, receiptId);
    return NextResponse.json({ scan_id: scanId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : typeof error === "object" && error ? JSON.stringify(error) : "Scan ingestion failed.";
    if (isTransientScanCallbackError(error)) {
      return NextResponse.json(
        { error: "Scan result storage is temporarily unavailable. Retry this callback." },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }
    if (cloudflarePrivateAvailable() && callbackJobId) {
      try {
        await failCloudflareScan(callbackJobId, detail);
      } catch {
        return NextResponse.json({ error: "Scan rejection could not be recorded." }, { status: 503, headers: { "Retry-After": "2" } });
      }
      return NextResponse.json({ error: detail.slice(0, 2000) }, { status: 422 });
    }
    if (receiptId) {
      const db = serviceDb();
      const rejected = await db.rpc("finish_scan_callback", {
        p_job_id: callbackJobId,
        p_receipt_id: receiptId,
        p_result: "callback_rejected",
        p_error: detail,
      });
      if (rejected.error) return NextResponse.json({ error: "Scan ingestion and failure recording both failed." }, { status: 503 });
    }
    return NextResponse.json({ error: detail.slice(0, 2000) }, { status: 422 });
  }
}

async function readBoundedBody(request: Request, limit: number): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("payload exceeds limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, length);
}

function isOversizedDecodedPayload(error: unknown): boolean {
  return error instanceof Error
    && ("code" in error && error.code === "ERR_BUFFER_TOO_LARGE"
      || error.message.toLowerCase().includes("larger than maxoutputlength"));
}
