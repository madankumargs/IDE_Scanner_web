import { publicCanonicalMismatch, singleExtensionDetail } from "./publication-canonical.mjs";

/**
 * Revalidate the rows that are about to become the active D1 release.
 *
 * This is deliberately pure: the activation script owns the remote query and
 * SQL write, while this helper owns the exact row-to-manifest contract. That
 * makes the final trust boundary directly testable without touching D1.
 */
export function cloudflarePublicationMismatches({ extensions, rows, scannerBuild }) {
  const byScanId = new Map(rows.map((row) => [String(row.scan_id || ""), row]));
  const mismatches = [];
  for (const item of extensions) {
    const scanId = String(item.scan_id || "");
    const row = byScanId.get(scanId);
    if (!row) {
      mismatches.push(`${item.extension_id}@${item.version}: scan ${scanId} was not found in D1`);
      continue;
    }
    const rowKey = `${String(row.extension_id || "").toLowerCase()}@${String(row.version || "")}`;
    const expectedKey = `${String(item.extension_id || "").toLowerCase()}@${String(item.version || "")}`;
    if (rowKey !== expectedKey) {
      mismatches.push(`${item.extension_id}@${item.version}: D1 scan identity does not match the manifest`);
      continue;
    }
    if (String(row.artifact_sha256 || "").toLowerCase() !== String(item.artifact_hash || "").toLowerCase()) {
      mismatches.push(`${item.extension_id}@${item.version}: D1 artifact hash does not match the manifest`);
    }
    if (String(row.job_status || "") !== "complete"
      || !["public_intelligence", "benchmark"].includes(String(row.scan_purpose || ""))
      || String(row.expected_scanner_build || "").toLowerCase() !== String(scannerBuild).toLowerCase()
      || String(row.job_extension_id || "").toLowerCase() !== String(item.extension_id || "").toLowerCase()
      || String(row.job_version || "") !== String(item.version || "")) {
      mismatches.push(`${item.extension_id}@${item.version}: D1 job identity or completion state is not release-eligible`);
    }
    let bundle;
    try {
      bundle = JSON.parse(String(row.report_json || ""));
    } catch {
      mismatches.push(`${item.extension_id}@${item.version}: D1 canonical report JSON is invalid`);
      continue;
    }
    const metadata = object(bundle.metadata);
    const detail = singleExtensionDetail(bundle.extensions);
    const canonicalMismatch = publicCanonicalMismatch({
      reportedSchemaVersion: metadata.schema_version,
      detail,
      metadata,
      expectedScannerBuild: scannerBuild,
      expectedExtensionId: item.extension_id,
      expectedVersion: item.version,
    });
    if (canonicalMismatch) mismatches.push(`${item.extension_id}@${item.version}: ${canonicalMismatch}`);
    if (String(detail.artifact_identity?.sha256 || "").toLowerCase() !== String(row.artifact_sha256 || "").toLowerCase()
      || String(detail.decision || "") !== String(item.decision || "")) {
      mismatches.push(`${item.extension_id}@${item.version}: canonical report no longer matches the release manifest`);
    }
  }
  if (rows.length !== extensions.length || byScanId.size !== extensions.length) {
    mismatches.push(`D1 returned ${rows.length} unique reports for ${extensions.length} release members`);
  }
  return mismatches;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
