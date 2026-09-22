import { createHash } from "node:crypto";
import { canonicalAnalysisStatus } from "@/lib/classificationContract";
import { publicCanonicalError } from "@/lib/publicCanonicalContract";
import { serviceDb } from "@/lib/supabase";
import { benchmarkRows } from "@/lib/websiteBenchmarkRows";

export { publicCanonicalError } from "@/lib/publicCanonicalContract";

type Bundle = { metadata?: Record<string, unknown>; extensions?: Record<string, Record<string, unknown>> | Array<Record<string, unknown>> };

export function incompleteArtifactReason(bundle: Bundle): string | null {
  const detail = singleExtension(bundle.extensions);
  if (!detail) return null;
  const identity = object(detail.artifact_identity);
  const identityHash = String(identity.sha256 || "").trim();
  const detailHash = String(detail.artifact_sha256 || "").trim();
  if (identityHash && detailHash && identityHash.toLowerCase() !== detailHash.toLowerCase()) {
    return "Artifact identity contains conflicting SHA-256 values.";
  }
  if (isSha256(identityHash || detailHash)) return null;
  if (String(detail.decision || "") !== "incomplete" && String(detail.source || "") !== "marketplace-error") return null;
  const inventory = object(detail.artifact_inventory);
  return String(inventory.skipped_reason || detail.decision_reason || detail.verdict_reason || "Artifact acquisition did not complete or did not provide a valid SHA-256 identity.").slice(0, 1000);
}

export async function ingestScanBundle(jobId: string, bundle: Bundle, receiptId?: string): Promise<string> {
  const db = serviceDb();
  const detail = singleExtension(bundle.extensions);
  if (!detail) throw new Error("Scanner bundle must contain exactly one extension detail.");
  const metadata = bundle.metadata || {};
  const scannerBuild = String(metadata.scanner_build || "").trim();
  const intelligenceSnapshot = object(metadata.intelligence_snapshot);
  const intelligenceDigest = String(object(intelligenceSnapshot.registry).sha256 || "");
  const identity = object(detail.artifact_identity);
  const coverage = object(detail.analysis_coverage);
  const inventory = object(detail.artifact_inventory);
  const provenance = object(detail.provenance);
  const capabilityAssessment = object(detail.capability_assessment);
  const reportedExtensionId = String(detail.extension_id || identity.extension_id || "");
  const version = String(detail.version || identity.version || "");
  const artifactSha = String(identity.sha256 || detail.artifact_sha256 || "");
  if (!reportedExtensionId || !version || !artifactSha) throw new Error("Bundle is missing immutable artifact identity.");
  if (!isSha256(artifactSha)) throw new Error("Bundle artifact identity must be a SHA-256 digest.");
  if (identity.sha256 && String(identity.sha256).toLowerCase() !== artifactSha.toLowerCase()) throw new Error("Bundle artifact identity fields disagree.");
  if (!scannerBuild || scannerBuild === "unknown") throw new Error("Bundle is missing immutable scanner build identity.");
  // Keep the scan callback compatible with the currently deployed database
  // while operational-intelligence migration 011 rolls out. A worker result
  // must never be rejected simply because an optional metrics column has not
  // been deployed yet.
  const queuedJob = await db.from("scan_jobs").select("extension_id,version,profile,scan_purpose,expected_scanner_build").eq("id", jobId).maybeSingle();
  if (queuedJob.error) throw new Error(`Scan job lookup failed: ${queuedJob.error.message}`);
  if (!queuedJob.data) throw new Error("Scan job was not found.");
  const expectedScannerBuild = String(queuedJob.data.expected_scanner_build || "").trim();
  if (!expectedScannerBuild) throw new Error("Scan job is missing its bound scanner build identity.");
  if (scannerBuild !== expectedScannerBuild) throw new Error("Scanner result build does not match the build bound to this job.");
  if (String(queuedJob.data.extension_id).toLowerCase() !== reportedExtensionId.toLowerCase() || queuedJob.data.version !== version) throw new Error("Scanner result does not match the claimed artifact.");
  // Registry identifiers are case-insensitive. Persist the inventory/job form
  // as the canonical database key so catalog, benchmark, and exact-report
  // queries all resolve the same row even when package.json uses display case.
  const extensionId = String(queuedJob.data.extension_id);
  const publicPurpose = ["public_intelligence", "benchmark"].includes(String(queuedJob.data.scan_purpose));
  if (publicPurpose && String(queuedJob.data.profile || "") !== "deep") throw new Error("Public scans must be bound to a deep runtime-enabled job.");
  const reportedSchemaVersion = String(metadata.schema_version || "").trim();
  const canonicalError = publicCanonicalError(publicPurpose, reportedSchemaVersion, detail, metadata, expectedScannerBuild, extensionId, version);
  if (canonicalError) throw new Error(canonicalError);
  const frozenBenchmarkArtifact = benchmarkRows.find((row) => row.id.toLowerCase() === extensionId.toLowerCase() && row.version === version);
  if (queuedJob.data.scan_purpose === "benchmark" && !frozenBenchmarkArtifact) throw new Error("Benchmark result is not part of the frozen corpus.");
  if (frozenBenchmarkArtifact && frozenBenchmarkArtifact.sha256.toLowerCase() !== artifactSha.toLowerCase()) throw new Error("Canonical result does not match the frozen benchmark artifact hash.");

  const scanRow = {
    job_id: jobId,
    extension_id: extensionId,
    version,
    artifact_sha256: artifactSha,
    profile: String(metadata.profile || "deep"),
    schema_version: reportedSchemaVersion || "unknown",
    scanner_version: String(metadata.scanner_version || "unknown"),
    scanner_build: scannerBuild,
    ruleset_version: String(metadata.ruleset_version || "unknown"),
    policy_version: String(metadata.policy_version || "legacy"),
    intelligence_snapshot: intelligenceSnapshot,
    intelligence_digest: intelligenceDigest || "legacy",
    scan_purpose: String(queuedJob.data.scan_purpose),
    analysis_status: canonicalAnalysisStatus(detail),
    decision: String(detail.decision || "incomplete"),
    decision_reason: String(detail.decision_reason || detail.verdict_reason || "Review scan evidence."),
    public_outcome: String(detail.public_outcome || legacyOutcome(detail)),
    decision_basis: String(detail.decision_basis || "legacy_scanner_result"),
    evidence_confidence: String(detail.evidence_confidence || "none"),
    provenance_tier: String(provenance.tier || "unknown"),
    expected_profile_id: String(provenance.profile_id || capabilityAssessment.profile_id || "") || null,
    capability_assessment: capabilityAssessment,
    score_schema_version: String(detail.score_schema_version || "1"),
    verdict: String(detail.verdict || "review"),
    severity: String(detail.severity || "INFO"),
    risk_score: Number(detail.risk_score || 0),
    malware_score: Number(detail.malware_score || 0),
    coverage_percent: Number(coverage.coverage_percent || 0),
    analysis_coverage: coverage,
    provider_coverage: object(coverage.providers),
    security_dimensions: object(detail.security_dimensions),
    manifest: object(detail.manifest),
    artifact_inventory: compactInventory(inventory),
    capabilities: object(detail.capabilities),
    baseline_diff: object(detail.baseline_diff),
    canonical_report: compactBundle(bundle),
    scanned_at: String(metadata.created_at || new Date().toISOString()),
  };
  const findings = array(detail.findings).map((raw, index) => { const item = object(raw); const baseId = String(item.finding_id || item.rule_id || "finding"); const evidenceType = String(item.evidence_type || "static"); return { id: `${baseId}-${index}`, rule_id: String(item.rule_id || "unknown"), category: String(item.category || "unknown"), severity: String(item.effective_severity || item.severity || "INFO"), confidence: Number(item.confidence || 0), evidence_type: evidenceType, evidence_class: String(item.evidence_class || "weak"), actionability: String(item.actionability || "contextual"), summary: String(item.evidence_summary || "Scanner evidence"), recommendation: String(item.recommendation || ""), file_refs: array(item.file_refs), evidence: { ...object(item.evidence), evidence_type: evidenceType, detector_severity: String(item.severity || "INFO") } } });
  const files = array(inventory.files).map((raw) => { const item = object(raw); return { path: String(item.path || ""), sha256: String(item.sha256 || ""), size_bytes: Number(item.size_bytes || 0), kind: String(item.kind || "file"), target: item.target ? String(item.target) : null }; }).filter((item) => item.path && item.sha256);
  const dependencies = array(detail.dependency_inventory).map((raw) => { const item = object(raw); return { name: String(item.name || ""), version: String(item.version || "unknown"), ecosystem: String(item.ecosystem || "npm"), relationship: String(item.relationship || "transitive"), advisories: array(item.advisories) }; }).filter((item) => item.name);
  const hashes = new Map(files.map((file) => [file.path, file.sha256.toLowerCase()]));
  const previews = array(inventory.source_previews).map((raw) => {
    const item = object(raw); const path = String(item.path || ""); const content = String(item.content || ""); const byteLength = Buffer.byteLength(content);
    const recordedHash = String(item.content_sha256 || "").toLowerCase(); const contentHash = createHash("sha256").update(content).digest("hex");
    if (!path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || byteLength > 204800 || hashes.get(path) !== contentHash || recordedHash !== contentHash) return null;
    return { path, content, content_sha256: contentHash, byte_length: byteLength, truncated: Boolean(item.truncated) };
  }).filter((item): item is { path: string; content: string; content_sha256: string; byte_length: number; truncated: boolean } => Boolean(item));
  const published = await db.rpc("publish_scan_result_atomically", {
    p_job_id: jobId,
    p_scan: scanRow,
    p_findings: findings,
    p_files: files,
    p_dependencies: dependencies,
    p_previews: previews,
    p_receipt_id: receiptId || null,
  });
  if (published.error) throw published.error;
  if (!published.data) throw new Error("Atomic scan publication returned no scan identity.");
  return String(published.data);
}

export function singleExtension(value: Bundle["extensions"]): Record<string, unknown> | null {
  const entries = Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object")
    : value && typeof value === "object"
      ? Object.values(value).filter((item) => item && typeof item === "object")
      : [];
  return entries.length === 1 ? entries[0] : null;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function isSha256(value: string): boolean { return /^[0-9a-f]{64}$/i.test(value); }
function legacyOutcome(detail: Record<string, unknown>): string {
  const decision = String(detail.decision || "incomplete");
  if (decision === "allow") return "clear";
  if (decision === "review") return "investigate";
  if (decision === "block") return String(detail.verdict) === "malicious" ? "confirmed_threat" : "preventive_block";
  return "incomplete";
}

function compactBundle(bundle: Bundle): Bundle {
  const extensions = bundle.extensions;
  if (Array.isArray(extensions)) return { ...bundle, extensions: extensions.map(compactDetail) };
  if (extensions && typeof extensions === "object") return { ...bundle, extensions: Object.fromEntries(Object.entries(extensions).map(([key, detail]) => [key, compactDetail(detail)])) };
  return bundle;
}
function compactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const inventory = object(detail.artifact_inventory);
  return { ...detail, artifact_inventory: compactInventory(inventory) };
}
function compactInventory(inventory: Record<string, unknown>): Record<string, unknown> {
  return { ...inventory, files: undefined, source_previews: undefined };
}
