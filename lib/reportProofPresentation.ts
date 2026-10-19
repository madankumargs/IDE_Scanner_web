export type ReportProof = {
  actionable: number | null;
  contextual: number | null;
  observations: number | null;
  capabilities: number | null;
  files: number | null;
  dependencies: number | null;
  artifactSha256Recorded: boolean;
  detailAvailable: boolean;
  source: string;
};

/**
 * Builds the public proof strip from the exact scan summary. Missing detail is
 * deliberately represented as null so the UI cannot turn an omitted list into
 * a false zero.
 */
export function reportProofPresentation(input: {
  scan: Record<string, unknown> | null | undefined;
  findings?: unknown;
  files?: unknown;
  dependencies?: unknown;
}): ReportProof {
  const scan = input.scan || {};
  const hasScan = Boolean(scan.id);
  const artifactSha256Recorded = /^[a-f0-9]{64}$/i.test(String(scan.artifact_sha256 || ""));
  const detailAvailable = hasScan && String(scan.report_detail_state || "") !== "summary_only";
  const summaryCountsRecorded = scan.summary_counts_recorded === true;
  const findings = detailAvailable && Array.isArray(input.findings)
    ? input.findings.filter(isRecord)
    : null;
  const grouped = findings ? groupFindings(findings) : null;
  const actionableGroups = grouped?.filter((item) => ["block", "investigate", "review"].includes(item.actionability)) || null;
  const contextualGroups = grouped?.filter((item) => ["low", "contextual"].includes(item.actionability)) || null;
  const artifactInventory = isRecord(scan.artifact_inventory) ? scan.artifact_inventory : null;
  const capabilities = objectKeys(scan.capabilities);
  const dependencyInventory = Array.isArray(scan.dependency_inventory)
    ? scan.dependency_inventory.length
    : isRecord(scan.dependencies)
      ? Object.keys(scan.dependencies).length
      : null;
  const actionable = actionableGroups?.length ?? integerOrNull(scan.actionable_count);
  const contextual = contextualGroups?.length ?? integerOrNull(scan.contextual_count);

  return {
    actionable: detailAvailable || summaryCountsRecorded
      ? integerOrNull(scan.actionable_findings_count) ?? actionable
      : null,
    contextual: detailAvailable || summaryCountsRecorded
      ? integerOrNull(scan.contextual_findings_count) ?? contextual
      : null,
    observations: Array.isArray(scan.evidence)
      ? scan.evidence.length
      : isRecord(scan.evidence)
        ? Object.keys(scan.evidence).length
        : integerOrNull(scan.evidence_count),
    capabilities: integerOrNull(scan.capability_count) ?? (capabilities ? capabilities.length : null),
    files: integerOrNull(scan.file_count) ?? integerOrNull(artifactInventory?.file_count) ?? (detailAvailable && Array.isArray(input.files) ? input.files.length : null),
    dependencies: integerOrNull(scan.dependency_count) ?? dependencyInventory ?? (detailAvailable && Array.isArray(input.dependencies) ? input.dependencies.length : null),
    artifactSha256Recorded,
    detailAvailable,
    source: String(scan.scan_id || scan.id || "exact scan"),
  };
}

function groupFindings(findings: Array<Record<string, unknown>>) {
  const groups = new Map<string, { actionability: string }>();
  for (const finding of findings) {
    const key = String(finding.rule_id || finding.category || finding.summary || "finding");
    const actionability = String(finding.actionability || "contextual");
    const current = groups.get(key);
    if (!current || actionabilityRank(actionability) > actionabilityRank(current.actionability)) {
      groups.set(key, { actionability });
    }
  }
  return [...groups.values()];
}

function actionabilityRank(value: string) {
  return ({ block: 5, investigate: 4, review: 3, low: 2, contextual: 1 } as Record<string, number>)[value] || 1;
}

function integerOrNull(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function objectKeys(value: unknown): string[] | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
