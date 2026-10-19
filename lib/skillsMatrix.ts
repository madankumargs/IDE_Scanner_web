export type SkillSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type SkillEvidenceClass =
  | "authoritative"
  | "dynamic_confirmed"
  | "corroborated_static"
  | "single_static"
  | "context";
export type SkillDimension =
  | "capability"
  | "injection_exfil"
  | "supply_chain"
  | "provenance"
  | "evasion"
  | "behaviour_change";

export type SkillRule = {
  id: string;
  title: string;
  analyzer: "manifest" | "instructions" | "scripts" | "deps" | "archive" | "intel" | "diff";
  method: string;
  severity: SkillSeverity;
  dimension: SkillDimension;
};

export type SkillFinding = {
  ruleId?: string;
  title?: string;
  severity: SkillSeverity;
  evidenceClass: SkillEvidenceClass;
  confidence: number;
  dimension: SkillDimension;
  authoritative?: boolean;
  file?: string;
  line?: number;
  endLine?: number;
  snippet?: string;
  explanation?: string;
};

export type SkillCoverage = {
  completedRequired: number;
  requiredAnalyzers: number;
  analyzers?: Record<string, "complete" | "incomplete" | "unavailable" | "failed">;
  limitations?: string[];
};

export const skillAnalyzers = [
  { id: "manifest", label: "Manifest & structure", required: true, weight: 1 },
  { id: "instructions", label: "Instruction layer", required: true, weight: 1 },
  { id: "scripts", label: "Script behavior", required: true, weight: 2 },
  { id: "deps", label: "Dependencies", required: true, weight: 1 },
  { id: "archive", label: "Archive safety", required: true, weight: 1 },
  { id: "intel", label: "Threat intelligence", required: true, weight: 1 },
  { id: "sandbox_probe", label: "Sandbox probe", required: false, weight: 1 },
] as const;

export const skillDimensions: ReadonlyArray<{ id: SkillDimension; label: string; weight: number }> = [
  { id: "capability", label: "Capability", weight: 0.2 },
  { id: "injection_exfil", label: "Injection & exfiltration", weight: 0.25 },
  { id: "supply_chain", label: "Supply chain", weight: 0.2 },
  { id: "provenance", label: "Provenance", weight: 0.1 },
  { id: "evasion", label: "Evasion", weight: 0.15 },
  { id: "behaviour_change", label: "Behaviour change", weight: 0.1 },
];

export const skillDetectionMatrix: SkillRule[] = [
  { id: "SK-M01", title: "Missing or invalid SKILL.md frontmatter", analyzer: "manifest", method: "parse", severity: "LOW", dimension: "provenance" },
  { id: "SK-M02", title: "Name impersonates a known or official skill", analyzer: "manifest", method: "fuzzy match + homoglyph", severity: "HIGH", dimension: "provenance" },
  { id: "SK-M03", title: "Over-broad trigger description", analyzer: "manifest", method: "pattern + specificity heuristic", severity: "MEDIUM", dimension: "injection_exfil" },
  { id: "SK-M04", title: "Unrestricted tool or network access", analyzer: "manifest", method: "frontmatter parse", severity: "MEDIUM", dimension: "capability" },
  { id: "SK-M05", title: "Undeclared bundled files", analyzer: "manifest", method: "reference graph", severity: "LOW", dimension: "provenance" },
  { id: "SK-M06", title: "Archive hazard or unexplained executable", analyzer: "archive", method: "static package inspection", severity: "HIGH", dimension: "evasion" },
  { id: "SK-I01", title: "Prompt-injection or system-prompt impersonation", analyzer: "instructions", method: "pattern + context", severity: "HIGH", dimension: "injection_exfil" },
  { id: "SK-I02", title: "Hidden Unicode or HTML instruction content", analyzer: "instructions", method: "codepoint scan", severity: "HIGH", dimension: "evasion" },
  { id: "SK-I03", title: "Instruction to read secrets", analyzer: "instructions", method: "sensitive-path pattern", severity: "HIGH", dimension: "injection_exfil" },
  { id: "SK-I04", title: "Instruction to send data externally", analyzer: "instructions", method: "URL + verb correlation", severity: "HIGH", dimension: "injection_exfil" },
  { id: "SK-I05", title: "Instruction to disable safety controls", analyzer: "instructions", method: "policy pattern", severity: "HIGH", dimension: "capability" },
  { id: "SK-I06", title: "Instruction to install or run remote code", analyzer: "instructions", method: "command pattern", severity: "MEDIUM", dimension: "supply_chain" },
  { id: "SK-I07", title: "Encoded payload in prose or references", analyzer: "instructions", method: "entropy + decode attempt", severity: "MEDIUM", dimension: "evasion" },
  { id: "SK-S01", title: "Secret or credential read", analyzer: "scripts", method: "call + sensitive-path pattern", severity: "MEDIUM", dimension: "capability" },
  { id: "SK-S02", title: "Outbound network to untrusted host", analyzer: "scripts", method: "network-call + host classification", severity: "MEDIUM", dimension: "injection_exfil" },
  { id: "SK-S03", title: "Secret-to-network data flow", analyzer: "scripts", method: "same-file source/sink correlation", severity: "CRITICAL", dimension: "injection_exfil" },
  { id: "SK-S04", title: "Dynamic code from fetched or decoded data", analyzer: "scripts", method: "dynamic-call pattern", severity: "HIGH", dimension: "evasion" },
  { id: "SK-S05", title: "Download and execute", analyzer: "scripts", method: "download/execute correlation", severity: "HIGH", dimension: "supply_chain" },
  { id: "SK-S06", title: "Persistence or agent-config modification", analyzer: "scripts", method: "path + write-operation pattern", severity: "HIGH", dimension: "capability" },
  { id: "SK-S07", title: "Destructive operation", analyzer: "scripts", method: "destructive-call + path pattern", severity: "HIGH", dimension: "capability" },
  { id: "SK-S08", title: "Obfuscation or high-entropy decoding", analyzer: "scripts", method: "decoder + entropy heuristic", severity: "MEDIUM", dimension: "evasion" },
  { id: "SK-S09", title: "Shell execution with interpolated input", analyzer: "scripts", method: "shell-call + interpolation pattern", severity: "MEDIUM", dimension: "capability" },
  { id: "SK-S10", title: "Privilege escalation", analyzer: "scripts", method: "privilege-command pattern", severity: "HIGH", dimension: "capability" },
  { id: "SK-S11", title: "Prebuilt executable without source", analyzer: "scripts", method: "file typing + source pairing", severity: "MEDIUM", dimension: "evasion" },
  { id: "SK-D01", title: "Dependency install script", analyzer: "deps", method: "manifest inspection", severity: "MEDIUM", dimension: "supply_chain" },
  { id: "SK-D02", title: "Typosquat, unknown, or unpinned dependency", analyzer: "deps", method: "manifest + registry metadata", severity: "MEDIUM", dimension: "supply_chain" },
  { id: "SK-D03", title: "Known-vulnerable dependency", analyzer: "deps", method: "OSV query", severity: "HIGH", dimension: "supply_chain" },
  { id: "SK-A01", title: "Exact match in curated malicious intelligence", analyzer: "intel", method: "exact match", severity: "CRITICAL", dimension: "provenance" },
  { id: "SK-B01", title: "New capability, host, script, or dependency", analyzer: "diff", method: "baseline diff", severity: "MEDIUM", dimension: "behaviour_change" },
  { id: "SK-B02", title: "Same version with a different hash", analyzer: "diff", method: "hash comparison", severity: "HIGH", dimension: "provenance" },
  { id: "SK-P01", title: "Unpinned source", analyzer: "manifest", method: "source metadata", severity: "MEDIUM", dimension: "provenance" },
  { id: "SK-P02", title: "Missing license or publisher provenance", analyzer: "manifest", method: "metadata check", severity: "INFO", dimension: "provenance" },
];

const severityWeight: Record<SkillSeverity, number> = { CRITICAL: 1, HIGH: 0.6, MEDIUM: 0.3, LOW: 0.1, INFO: 0 };
const evidenceWeight: Record<SkillEvidenceClass, number> = { authoritative: 1, dynamic_confirmed: 0.95, corroborated_static: 0.8, single_static: 0.4, context: 0.1 };

export function scoreSkillFindings(findings: SkillFinding[]) {
  const dimensions = Object.fromEntries(skillDimensions.map(({ id }) => [id, 0])) as Record<SkillDimension, number>;
  const weights = findings.map((finding) => severityWeight[finding.severity] * evidenceWeight[finding.evidenceClass] * clamp(finding.confidence));
  findings.forEach((finding, index) => {
    const weight = weights[index];
    dimensions[finding.dimension] = 100 * (1 - (1 - dimensions[finding.dimension] / 100) * (1 - weight));
  });
  const risk = Math.min(100, skillDimensions.reduce((total, dimension) => total + dimension.weight * dimensions[dimension.id], 0) + 0.3 * Math.max(...Object.values(dimensions), 0));
  const malware = 100 * (1 - weights.filter((_, index) => evidenceWeight[findings[index].evidenceClass] >= 0.8).reduce((product, weight) => product * (1 - weight), 1));
  return { dimensions, risk, malware };
}

export function decideSkillScan(findings: SkillFinding[], coverage: SkillCoverage, scores = scoreSkillFindings(findings)) {
  const coveragePercent = coverage.requiredAnalyzers ? 100 * coverage.completedRequired / coverage.requiredAnalyzers : 0;
  const hasAuthoritative = findings.some((finding) => finding.authoritative === true || finding.evidenceClass === "authoritative");
  const criticalHighEvidence = findings.some((finding) => finding.severity === "CRITICAL" && evidenceWeight[finding.evidenceClass] >= 0.8);
  if (hasAuthoritative || (scores.malware >= 85 && criticalHighEvidence)) return "block" as const;
  if (coveragePercent < 100) return "incomplete" as const;
  if (findings.some((finding) => severityWeight[finding.severity] >= severityWeight.MEDIUM && evidenceWeight[finding.evidenceClass] >= 0.4) || scores.risk >= 25 || findings.some((finding) => finding.dimension === "provenance" && severityWeight[finding.severity] >= severityWeight.LOW && evidenceWeight[finding.evidenceClass] >= 0.4)) return "review" as const;
  return "allow" as const;
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
