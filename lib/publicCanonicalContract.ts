import { canonicalAnalysisStatus } from "@/lib/classificationContract";
import { publicRuntimeError } from "@/lib/publicRuntimeContract";

type ValueMap = Record<string, unknown>;

/**
 * Shared admission contract for reports that may become public or benchmark
 * intelligence. Keeping this pure lets the Supabase and Cloudflare/D1
 * callback paths enforce exactly the same rules before durable persistence.
 */
export function publicCanonicalError(
  publicPurpose: boolean,
  reportedSchemaVersion: string,
  detail: ValueMap,
  metadata: ValueMap,
  expectedScannerBuild?: string,
  expectedExtensionId?: string,
  expectedVersion?: string,
): string | null {
  if (!publicPurpose) return null;
  if (reportedSchemaVersion !== "2.3") return "Public scans require canonical report schema 2.3.";
  if (String(detail.score_schema_version || "") !== "2") return "Public scans require canonical score schema v2.";
  if (String(metadata.scanner_version || "").includes("hosted-static")) return "Hosted-static reports cannot be published as canonical scans.";
  const identity = objectValue(detail.artifact_identity);
  const identityExtensionId = String(identity.extension_id || "").trim();
  const detailExtensionId = String(detail.extension_id || "").trim();
  const identityVersion = String(identity.version || "").trim();
  const detailVersion = String(detail.version || "").trim();
  if (identityExtensionId && detailExtensionId && identityExtensionId.toLowerCase() !== detailExtensionId.toLowerCase()) {
    return "Public scans require matching extension identity fields.";
  }
  if (identityVersion && detailVersion && identityVersion !== detailVersion) {
    return "Public scans require matching extension version fields.";
  }
  const claimedExtensionId = detailExtensionId || identityExtensionId;
  const claimedVersion = detailVersion || identityVersion;
  if (expectedExtensionId && (!claimedExtensionId || claimedExtensionId.toLowerCase() !== expectedExtensionId.toLowerCase())) {
    return "Scanner result does not match the publication extension identity.";
  }
  if (expectedVersion && (!claimedVersion || claimedVersion !== expectedVersion)) {
    return "Scanner result does not match the publication extension version.";
  }
  const identityHash = String(identity.sha256 || "").trim();
  const detailHash = String(detail.artifact_sha256 || "").trim();
  if (!isSha256(identityHash || detailHash)) return "Public scans require canonical artifact SHA-256 identity.";
  if (identityHash && detailHash && identityHash.toLowerCase() !== detailHash.toLowerCase()) {
    return "Public scans require matching artifact SHA-256 identity fields.";
  }
  if (!metadata.policy_version || metadata.policy_version === "legacy") return "Public scans require an explicit non-legacy classification policy.";
  if (!metadata.ruleset_version || metadata.ruleset_version === "unknown") return "Public scans require an explicit ruleset version.";
  const intelligence = objectValue(metadata.intelligence_snapshot);
  const runtimeError = publicRuntimeError(metadata, objectValue(detail.analysis_coverage));
  if (runtimeError) return runtimeError;
  const registryIntelligence = objectValue(intelligence.registry);
  if (!/^[0-9a-f]{64}$/.test(String(registryIntelligence.sha256 || ""))) {
    return "Public scans require immutable registry intelligence identity.";
  }
  const registryPayload = objectValue(registryIntelligence.payload);
  if (!Array.isArray(registryPayload.findings) || !Array.isArray(registryPayload.errors)) {
    return "Public scans require replayable registry intelligence evidence.";
  }
  const scannerBuild = String(metadata.scanner_build || "");
  if (!expectedScannerBuild) return "Public scans require a job-bound scanner build.";
  if (scannerBuild !== expectedScannerBuild) return "Scanner build does not match the build bound to this job.";
  const status = canonicalAnalysisStatus(detail);
  const decision = String(detail.decision || "incomplete");
  const coverage = objectValue(detail.analysis_coverage);
  if (!detail.analysis_status) return "Public scans require canonical analysis status.";
  if (coverage.status !== status && !(status === "failed" && coverage.status === "incomplete")) {
    return "Canonical analysis status must agree with analysis coverage status.";
  }
  if (typeof coverage.executable_file_coverage_percent !== "number") {
    return "Public scans require explicit executable-file coverage.";
  }
  if (status === "complete" && coverage.required_providers_complete !== true) {
    return "A complete scan requires every required analyzer to complete.";
  }
  if (status === "complete" && !["allow", "review", "block"].includes(decision)) return "A complete scan requires an allow, review, or block decision.";
  if (status !== "complete" && !["incomplete", "block"].includes(decision)) return "An incomplete or failed scan cannot publish an approval decision.";
  return null;
}

function objectValue(value: unknown): ValueMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ValueMap : {};
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}
