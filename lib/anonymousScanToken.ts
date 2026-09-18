import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { runtimeEnv } from "@/lib/runtimeEnv";

/**
 * Capability token that lets the anonymous requester of a free Deep Scan open
 * their own completed report. The report URL already contains an unguessable
 * scan UUID, but on the Supabase path RLS hides private scans from anonymous
 * readers, so the page needs proof the server issued this viewing grant.
 *
 * The token is bound to the scan *job* id and is only ever honored for jobs
 * with no authenticated requester (requested_by IS NULL), so it can never
 * expose a signed-in user's private scan even if mishandled.
 */
function tokenSecret(): string {
  return runtimeEnv("SCAN_CALLBACK_SECRET") || runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "";
}

export function issueAnonymousReportKey(jobId: string): string | null {
  const secret = tokenSecret();
  if (!secret || !jobId) return null;
  return createHmac("sha256", secret).update(`anon-report:${jobId}`).digest("hex");
}

export function validAnonymousReportKey(jobId: string, key: string): boolean {
  const secret = tokenSecret();
  if (!secret || !jobId || !/^[0-9a-f]{64}$/i.test(key)) return false;
  const expected = createHmac("sha256", secret).update(`anon-report:${jobId}`).digest("hex");
  return key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}
