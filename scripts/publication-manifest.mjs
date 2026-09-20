const SHA256 = /^[0-9a-f]{64}$/i;
const PUBLIC_DECISIONS = new Set(["allow", "review", "block"]);
export const MAX_PUBLICATION_REPORTS = 10_000;

/**
 * Validate the immutable members of a publication manifest immediately before
 * the database write. The report builder performs similar checks, but the
 * final activation boundary must remain fail-closed if a generated file is
 * edited, truncated, or produced by a different tool.
 */
export function validatePublicationManifest(extensions, { requireScanId = true } = {}) {
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error("Publication manifest must contain at least one extension.");
  }
  if (extensions.length > MAX_PUBLICATION_REPORTS) {
    throw new Error(`Publication manifest cannot contain more than ${MAX_PUBLICATION_REPORTS} extensions.`);
  }

  const artifactKeys = new Set();
  const scanIds = new Set();
  for (const [index, item] of extensions.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Publication manifest member ${index} is not an object.`);
    }
    const extensionId = String(item.extension_id || "").trim();
    const version = String(item.version || "").trim();
    const scanId = String(item.scan_id || "").trim();
    const artifactHash = String(item.artifact_hash || "").trim().toLowerCase();
    const decision = String(item.decision || "").trim();
    if (!extensionId || !version || (requireScanId && !scanId)) {
      throw new Error(`Publication manifest member ${index} is missing extension identity or scan_id.`);
    }
    if (!SHA256.test(artifactHash)) {
      throw new Error(`Publication manifest member ${extensionId}@${version} has an invalid artifact SHA-256.`);
    }
    if (!PUBLIC_DECISIONS.has(decision)) {
      throw new Error(`Publication manifest member ${extensionId}@${version} has an invalid publication decision.`);
    }
    const artifactKey = `${extensionId.toLowerCase()}@${version}`;
    if (artifactKeys.has(artifactKey)) {
      throw new Error(`Publication manifest contains duplicate artifact ${artifactKey}.`);
    }
    if (scanId && scanIds.has(scanId)) {
      throw new Error(`Publication manifest reuses scan_id ${scanId}.`);
    }
    artifactKeys.add(artifactKey);
    if (scanId) scanIds.add(scanId);
  }

  return { artifact_count: extensions.length, artifact_keys: artifactKeys, scan_ids: scanIds };
}
