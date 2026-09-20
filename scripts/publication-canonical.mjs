import { publicationRuntimeMismatch } from "./publication-runtime.mjs";

/**
 * Recheck the canonical public-report contract immediately before a release
 * manifest is built. Callback ingestion is the first boundary, but release
 * builders must also reject legacy or manually edited rows already present in
 * Supabase/D1.
 */
export function publicCanonicalMismatch({ reportedSchemaVersion, detail, metadata, expectedScannerBuild, expectedExtensionId, expectedVersion }) {
  if (String(reportedSchemaVersion || "") !== "2.3") return "public report schema must be 2.3";
  if (String(detail.score_schema_version || "") !== "2") return "public score schema must be v2";
  if (String(metadata.scanner_version || "").includes("hosted-static")) return "hosted-static reports cannot be published";

  const identity = object(detail.artifact_identity);
  const identityExtensionId = String(identity.extension_id || "").trim();
  const detailExtensionId = String(detail.extension_id || "").trim();
  const identityVersion = String(identity.version || "").trim();
  const detailVersion = String(detail.version || "").trim();
  if (identityExtensionId && detailExtensionId && identityExtensionId.toLowerCase() !== detailExtensionId.toLowerCase()) {
    return "public report extension identity fields disagree";
  }
  if (identityVersion && detailVersion && identityVersion !== detailVersion) {
    return "public report extension version fields disagree";
  }
  const claimedExtensionId = detailExtensionId || identityExtensionId;
  const claimedVersion = detailVersion || identityVersion;
  if (expectedExtensionId && (!claimedExtensionId || claimedExtensionId.toLowerCase() !== String(expectedExtensionId).toLowerCase())) {
    return "public report extension identity does not match the database row";
  }
  if (expectedVersion && (!claimedVersion || claimedVersion !== String(expectedVersion))) {
    return "public report extension version does not match the database row";
  }
  const identityHash = String(identity.sha256 || "").trim();
  const detailHash = String(detail.artifact_sha256 || "").trim();
  if (!SHA256.test(identityHash || detailHash)) return "public report requires a canonical artifact SHA-256";
  if (identityHash && detailHash && identityHash.toLowerCase() !== detailHash.toLowerCase()) {
    return "public report artifact SHA-256 fields disagree";
  }
  if (!metadata.policy_version || metadata.policy_version === "legacy") return "public report requires a non-legacy policy";
  if (!metadata.ruleset_version || metadata.ruleset_version === "unknown") return "public report requires an explicit ruleset";

  const runtimeMismatch = publicationRuntimeMismatch({
    profile: metadata.profile,
    metadata,
    analysisCoverage: object(detail.analysis_coverage),
  });
  if (runtimeMismatch) return runtimeMismatch;

  const intelligence = object(metadata.intelligence_snapshot);
  const registry = object(intelligence.registry);
  if (!SHA256.test(String(registry.sha256 || ""))) return "public report requires immutable registry intelligence identity";
  const payload = object(registry.payload);
  if (!Array.isArray(payload.findings) || !Array.isArray(payload.errors)) {
    return "public report requires replayable registry intelligence evidence";
  }

  const scannerBuild = String(metadata.scanner_build || "");
  if (!expectedScannerBuild) return "public report requires a job-bound scanner build";
  if (scannerBuild !== expectedScannerBuild) return "public report scanner build does not match the release build";

  const status = canonicalAnalysisStatus(detail);
  const coverage = object(detail.analysis_coverage);
  const decision = String(detail.decision || "incomplete");
  if (!detail.analysis_status) return "public report requires canonical analysis status";
  if (coverage.status !== status && !(status === "failed" && coverage.status === "incomplete")) {
    return "public report analysis status disagrees with coverage status";
  }
  if (typeof coverage.executable_file_coverage_percent !== "number") return "public report requires executable-file coverage";
  if (status === "complete" && coverage.required_providers_complete !== true) return "complete public report lacks required provider completion";
  if (status === "complete" && !PUBLIC_DECISIONS.has(decision)) return "complete public report has no valid publication decision";
  if (status !== "complete" && !["incomplete", "block"].includes(decision)) return "incomplete public report has an approval decision";
  return null;
}

export function singleExtensionDetail(value) {
  const entries = Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : Object.values(object(value)).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  return entries.length === 1 ? entries[0] : {};
}

const SHA256 = /^[0-9a-f]{64}$/i;
const PUBLIC_DECISIONS = new Set(["allow", "review", "block"]);

function canonicalAnalysisStatus(detail) {
  const raw = String(detail.analysis_status || object(detail.analysis_coverage).status || "incomplete");
  return raw === "complete" || raw === "failed" ? raw : "incomplete";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
