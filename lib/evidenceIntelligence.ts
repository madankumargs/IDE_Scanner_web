import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const EVIDENCE_INTELLIGENCE_SCHEMA_VERSION = "1.0";
export const EVIDENCE_INTELLIGENCE_MAX_CONTEXT_CHARS = 30_000;

export type IntelligenceAudience = "security_lead" | "engineer" | "publisher";
export type IntelligenceDepth = "standard";
export type EvidenceCertainty = "observed" | "bounded_inference" | "unknown";
export type BlastRadiusLevel = "none" | "low" | "moderate" | "broad" | "critical" | "unknown";
export type IntelligenceSection = "decision" | "access_surface" | "data_flow" | "blast_radius" | "release_delta" | "context";

export type EvidenceReference = {
  ref: string;
  kind: "scan" | "capability" | "finding" | "file" | "dependency" | "coverage";
  label: string;
  detail: string;
  section: "overview" | "alerts" | "capabilities" | "dependencies" | "files" | "coverage" | "changes" | "provenance";
};

export type EvidenceFact = {
  ref: string;
  label: string;
  value: string;
  certainty: EvidenceCertainty;
  evidence_refs: string[];
};

export type AccessSurfaceEntry = {
  id: string;
  asset: string;
  asset_label: string;
  operation: string;
  scope: string;
  status: "observed" | "detected" | "not_classified";
  preconditions: string[];
  evidence_refs: string[];
};

export type DataFlowNode = {
  id: string;
  label: string;
  kind: "extension" | "asset" | "external" | "unknown";
  evidence_refs: string[];
};

export type DataFlowEdge = {
  id: string;
  from: string;
  to: string;
  action: string;
  evidence_refs: string[];
};

export type BlastRadiusDimension = {
  level: BlastRadiusLevel;
  summary: string;
  preconditions: string[];
  evidence_refs: string[];
};

export type BlastRadiusAssessment = {
  overall: BlastRadiusLevel;
  dimensions: {
    confidentiality: BlastRadiusDimension;
    integrity: BlastRadiusDimension;
    availability: BlastRadiusDimension;
    network: BlastRadiusDimension;
    persistence: BlastRadiusDimension;
    supply_chain: BlastRadiusDimension;
  };
  evidence_refs: string[];
};

export type ReleaseDelta = {
  available: boolean;
  baseline_version: string | null;
  current_version: string;
  summary: string;
  added: string[];
  removed: string[];
  unchanged: string[];
  evidence_refs: string[];
};

export type IntelligenceClaim = {
  claim_id: string;
  section: IntelligenceSection;
  text: string;
  certainty: EvidenceCertainty;
  evidence_refs: string[];
};

export type IntelligenceAction = {
  text: string;
  evidence_refs: string[];
};

export type IntelligenceNarrativeDraft = {
  headline: string;
  bottom_line: string;
  summary_evidence_refs: string[];
  claims: IntelligenceClaim[];
  positive_signals: IntelligenceClaim[];
  unknowns: IntelligenceClaim[];
  verify_next: IntelligenceAction[];
};

export type EvidenceIntelligenceContext = {
  schema_version: string;
  identity: {
    extension_id: string;
    version: string;
    scan_id: string;
    artifact_sha256: string;
  };
  deterministic: {
    decision: string;
    analysis_status: string;
    severity: string;
    public_outcome: string;
    decision_reason: string;
    coverage_percent: number | null;
    evidence_confidence: string;
    provenance_tier: string;
    scanner_build: string;
    ruleset_version: string;
  };
  facts: EvidenceFact[];
  evidence: EvidenceReference[];
  access_surface: AccessSurfaceEntry[];
  data_flow: {
    nodes: DataFlowNode[];
    edges: DataFlowEdge[];
  };
  blast_radius: BlastRadiusAssessment;
  release_delta: ReleaseDelta;
  report_inventory: {
    finding_count: number;
    file_count: number;
    dependency_count: number;
    capability_count: number;
    advisory_count: number;
  };
  coverage_boundaries: string[];
  omitted_fields: string[];
  serialized: string;
  context_digest: string;
  evidence_refs: string[];
};

export type EvidenceIntelligenceTicket = {
  serialized: string;
  context_digest: string;
  signature: string;
};

export type EvidenceIntelligenceReport = {
  schema_version: string;
  generated_at: string;
  model: string;
  audience: IntelligenceAudience;
  depth: IntelligenceDepth;
  context_digest: string;
  identity: EvidenceIntelligenceContext["identity"];
  deterministic: EvidenceIntelligenceContext["deterministic"] & {
    decision_unchanged: true;
  };
  narrative: IntelligenceNarrativeDraft;
  access_surface: AccessSurfaceEntry[];
  data_flow: EvidenceIntelligenceContext["data_flow"];
  blast_radius: BlastRadiusAssessment;
  release_delta: ReleaseDelta;
  evidence: EvidenceReference[];
  report_inventory: EvidenceIntelligenceContext["report_inventory"];
  coverage_boundaries: string[];
  omitted_fields: string[];
  validation: {
    status: "validated";
    claims_with_evidence: number;
    generated_at: string;
  };
};

type RecordValue = Record<string, unknown>;

const MAX_FINDINGS = 60;
const MAX_FILES = 100;
const MAX_DEPENDENCIES = 60;
const MAX_EVIDENCE_REFERENCES = 260;
const MAX_STRING = 700;
const LEVEL_RANK: Record<BlastRadiusLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  broad: 3,
  critical: 4,
  unknown: -1,
};

const CAPABILITY_RULES: Array<{
  matches: string[];
  asset: string;
  asset_label: string;
  operation: string;
  scope: string;
  dimensions: Array<keyof BlastRadiusAssessment["dimensions"]>;
}> = [
  { matches: ["filesystem", "file", "file_read", "workspace_read", "workspace"], asset: "workspace_files", asset_label: "Workspace and files", operation: "read workspace or packaged files", scope: "local workspace and extension files", dimensions: ["confidentiality"] },
  { matches: ["file_write", "filesystem_write", "workspace_write", "write_files", "file_modification"], asset: "workspace_files", asset_label: "Workspace and files", operation: "write or modify files", scope: "local workspace and extension files", dimensions: ["integrity"] },
  { matches: ["credentials", "credential", "secret", "secrets", "keychain", "environment", "env"], asset: "secrets_credentials", asset_label: "Secrets and credentials", operation: "read credential-like or environment data", scope: "local credential stores or process environment", dimensions: ["confidentiality"] },
  { matches: ["clipboard"], asset: "editor_state", asset_label: "Editor and user state", operation: "read or write clipboard state", scope: "local user clipboard", dimensions: ["confidentiality", "integrity"] },
  { matches: ["editor", "document", "workspace_state", "settings", "configuration"], asset: "editor_state", asset_label: "Editor and user state", operation: "access editor or workspace state", scope: "local editor session and workspace settings", dimensions: ["confidentiality", "integrity"] },
  { matches: ["shell", "terminal", "process", "process_exec", "child_process", "command", "exec", "spawn"], asset: "process_execution", asset_label: "Terminal and processes", operation: "spawn processes or execute commands", scope: "the local user account and host process boundary", dimensions: ["integrity", "availability", "confidentiality"] },
  { matches: ["network", "outbound_network", "network_access", "http", "https", "fetch", "socket", "websocket", "egress"], asset: "external_services", asset_label: "Network and external services", operation: "make outbound network requests", scope: "external destinations reachable by the host", dimensions: ["network"] },
  { matches: ["activation", "startup", "persistence", "install", "lifecycle", "autoload"], asset: "persistence_startup", asset_label: "Startup and persistence", operation: "activate during a lifecycle or startup event", scope: "extension host lifecycle", dimensions: ["persistence"] },
  { matches: ["dependency", "dependencies", "package", "supply_chain", "npm", "runtime_dependency"], asset: "supply_chain", asset_label: "Dependencies and supply chain", operation: "load or expose runtime dependency code", scope: "packaged dependency graph", dimensions: ["supply_chain"] },
  { matches: ["resource", "cpu", "memory", "availability", "denial", "loop"], asset: "host_resources", asset_label: "Host resources", operation: "consume or affect host resources", scope: "local extension host", dimensions: ["availability"] },
];

export function compileEvidenceIntelligenceContext(product: RecordValue): EvidenceIntelligenceContext {
  const scan = objectValue(product.scan);
  const version = safeText(product.version || scan.version, 140) || "unknown";
  const extensionId = safeText(scan.extension_id || product.extension_id, 220) || "unknown";
  const scanId = safeText(scan.id, 160) || "unknown";
  const artifactSha = safeText(scan.artifact_sha256, 100).toLowerCase();
  const findings = recordArray(product.findings);
  const files = recordArray(product.files);
  const dependencies = recordArray(product.dependencies);

  const evidence: EvidenceReference[] = [];
  const facts: EvidenceFact[] = [];
  const addEvidence = (reference: EvidenceReference) => {
    if (evidence.length < MAX_EVIDENCE_REFERENCES && !evidence.some((item) => item.ref === reference.ref)) evidence.push(reference);
  };
  const addFact = (fact: EvidenceFact) => facts.push(fact);

  addEvidence({ ref: "scan.identity", kind: "scan", label: "Exact scan identity", detail: `${extensionId}@${version} · ${scanId}`, section: "overview" });
  addEvidence({ ref: "scan.decision", kind: "scan", label: "Deterministic decision", detail: safeText(scan.decision, 80) || "incomplete", section: "overview" });
  addEvidence({ ref: "scan.reason", kind: "scan", label: "Decision rationale", detail: safeText(scan.decision_reason, MAX_STRING) || "No deterministic rationale was recorded.", section: "overview" });
  addEvidence({ ref: "scan.coverage", kind: "coverage", label: "Analysis coverage", detail: formatCoverage(scan.coverage_percent), section: "coverage" });
  addEvidence({ ref: "scan.provenance", kind: "scan", label: "Artifact provenance", detail: `${safeText(scan.provenance_tier, 100) || "unknown"} · ${artifactSha || "hash not recorded"}`, section: "provenance" });
  addEvidence({ ref: "scan.analysis_status", kind: "scan", label: "Analysis status", detail: safeText(scan.analysis_status, 80) || "incomplete", section: "overview" });
  addEvidence({ ref: "scan.severity", kind: "scan", label: "Deterministic severity", detail: safeText(scan.severity, 80) || "INFO", section: "overview" });
  addEvidence({ ref: "scan.public_outcome", kind: "scan", label: "Public outcome", detail: safeText(scan.public_outcome, 120) || "incomplete", section: "overview" });
  addEvidence({ ref: "scan.evidence_confidence", kind: "scan", label: "Evidence confidence", detail: safeText(scan.evidence_confidence, 100) || "unknown", section: "overview" });
  addEvidence({ ref: "scan.scanner_build", kind: "scan", label: "Scanner build", detail: safeText(scan.scanner_build, 120) || "unknown", section: "provenance" });
  addEvidence({ ref: "scan.ruleset_version", kind: "scan", label: "Ruleset version", detail: safeText(scan.ruleset_version, 120) || "unknown", section: "provenance" });
  addFact({ ref: "scan.decision", label: "Decision", value: safeText(scan.decision, 80) || "incomplete", certainty: "observed", evidence_refs: ["scan.decision"] });
  addFact({ ref: "scan.coverage", label: "Coverage", value: formatCoverage(scan.coverage_percent), certainty: "observed", evidence_refs: ["scan.coverage"] });
  addFact({ ref: "scan.reason", label: "Decision rationale", value: safeText(scan.decision_reason, MAX_STRING) || "No deterministic rationale was recorded.", certainty: "observed", evidence_refs: ["scan.decision"] });

  const capabilityRecords = normalizeCapabilityRecords(scan);
  const accessSurface = deriveAccessSurface(capabilityRecords, findings, addEvidence);
  if (dependencies.length && !accessSurface.some((entry) => entry.asset === "supply_chain")) {
    accessSurface.push({ id: "supply_chain", asset: "supply_chain", asset_label: "Dependencies and supply chain", operation: "load or expose runtime dependency code", scope: "packaged dependency graph", status: "observed", preconditions: ["A dependency is relevant only when loaded by the extension runtime."], evidence_refs: ["scan.identity"] });
  }
  const blastRadius = deriveBlastRadius(accessSurface, findings, dependencies, scan, addEvidence);

  const normalizedFindings = findings.slice(0, MAX_FINDINGS).map((finding, index) => {
    const ref = findingReference(finding, index);
    addEvidence({
      ref,
      kind: "finding",
      label: safeText(finding.rule_id, 160) || `Finding ${index + 1}`,
      detail: safeText(finding.summary || finding.evidence_summary || finding.recommendation, MAX_STRING) || "Scanner finding",
      section: "alerts",
    });
    return {
      ref,
      rule_id: safeText(finding.rule_id, 160) || "unknown",
      category: safeText(finding.category, 120) || "unknown",
      severity: safeText(finding.severity || finding.effective_severity, 60) || "INFO",
      confidence: finiteNumber(finding.confidence),
      evidence_class: safeText(finding.evidence_class, 100) || "unknown",
      actionability: safeText(finding.actionability, 100) || "contextual",
      summary: safeText(finding.summary || finding.evidence_summary, MAX_STRING) || "Scanner finding",
      recommendation: safeText(finding.recommendation, MAX_STRING),
      file_refs: safeStringArray(finding.file_refs, 8, 180),
    };
  });

  const normalizedFiles = files.slice(0, MAX_FILES).map((file, index) => {
    const path = safeText(file.path, 260) || `file-${index + 1}`;
    const ref = `file.${slug(path)}.${index + 1}`;
    addEvidence({ ref, kind: "file", label: path, detail: `${safeText(file.kind, 60) || "file"} · ${formatBytes(file.size_bytes)}`, section: "files" });
    return { ref, path, kind: safeText(file.kind, 60) || "file", size_bytes: finiteNumber(file.size_bytes), preview_available: Boolean(file.preview_available) };
  });

  let advisoryCount = 0;
  const normalizedDependencies = dependencies.slice(0, MAX_DEPENDENCIES).map((dependency, index) => {
    const name = safeText(dependency.name, 180) || `dependency-${index + 1}`;
    const versionValue = safeText(dependency.version, 100) || "unknown";
    const advisories = Array.isArray(dependency.advisories) ? dependency.advisories : [];
    advisoryCount += advisories.length;
    const ref = `dependency.${slug(`${name}@${versionValue}`)}.${index + 1}`;
    addEvidence({ ref, kind: "dependency", label: name, detail: `${versionValue} · ${advisories.length} advisory record(s)`, section: "dependencies" });
    return { ref, name, version: versionValue, ecosystem: safeText(dependency.ecosystem, 80) || "unknown", relationship: safeText(dependency.relationship, 100) || "unknown", advisory_count: advisories.length };
  });

  if (dependencies.length) {
    const supplyChain = accessSurface.find((entry) => entry.asset === "supply_chain");
    if (supplyChain) supplyChain.evidence_refs = uniqueStrings([...supplyChain.evidence_refs, ...normalizedDependencies.slice(0, 8).map((item) => item.ref)]);
  }
  accessSurface.sort((a, b) => a.id.localeCompare(b.id));
  const dataFlow = buildDataFlow(extensionId, accessSurface);

  addFact({ ref: "scan.capabilities", label: "Recorded capability families", value: String(capabilityRecords.length), certainty: capabilityRecords.length ? "observed" : "unknown", evidence_refs: capabilityRecords.map((item) => item.evidence_ref).filter(Boolean) });
  addEvidence({ ref: "scan.capabilities", kind: "capability", label: "Recorded capability families", detail: `${capabilityRecords.length} capability family(ies) normalized from the report`, section: "capabilities" });
  addFact({ ref: "scan.inventory", label: "Report inventory", value: `${findings.length} findings · ${files.length} files · ${dependencies.length} dependencies`, certainty: "observed", evidence_refs: ["scan.identity"] });
  addEvidence({ ref: "scan.inventory", kind: "scan", label: "Report inventory", detail: `${findings.length} findings · ${files.length} files · ${dependencies.length} dependencies`, section: "overview" });

  const coverageBoundaries = deriveCoverageBoundaries(scan, product, findings, files);
  const releaseDelta = deriveReleaseDelta(scan, version, addEvidence);
  const omittedFields = [
    findings.length > MAX_FINDINGS ? `${findings.length - MAX_FINDINGS} findings beyond the context limit` : "",
    files.length > MAX_FILES ? `${files.length - MAX_FILES} files beyond the context limit` : "",
    dependencies.length > MAX_DEPENDENCIES ? `${dependencies.length - MAX_DEPENDENCIES} dependencies beyond the context limit` : "",
    "raw source contents and README text are not included",
    "raw dependency advisory payloads are not included",
  ].filter(Boolean);

  const base = {
    schema_version: EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
    identity: { extension_id: extensionId, version, scan_id: scanId, artifact_sha256: artifactSha },
    deterministic: {
      decision: safeText(scan.decision, 80) || "incomplete",
      analysis_status: safeText(scan.analysis_status, 80) || "incomplete",
      severity: safeText(scan.severity, 80) || "INFO",
      public_outcome: safeText(scan.public_outcome, 120) || "incomplete",
      decision_reason: safeText(scan.decision_reason, MAX_STRING) || "No deterministic rationale was recorded.",
      coverage_percent: finiteNumber(scan.coverage_percent),
      evidence_confidence: safeText(scan.evidence_confidence, 100) || "unknown",
      provenance_tier: safeText(scan.provenance_tier, 100) || "unknown",
      scanner_build: safeText(scan.scanner_build, 120) || "unknown",
      ruleset_version: safeText(scan.ruleset_version, 120) || "unknown",
    },
    facts,
    evidence,
    access_surface: accessSurface,
    data_flow: dataFlow,
    blast_radius: blastRadius,
    release_delta: releaseDelta,
    report_inventory: {
      finding_count: findings.length,
      file_count: files.length,
      dependency_count: dependencies.length,
      capability_count: capabilityRecords.length,
      advisory_count: advisoryCount,
    },
    coverage_boundaries: coverageBoundaries,
    omitted_fields: omittedFields,
    report_detail: {
      findings: normalizedFindings,
      files: normalizedFiles,
      dependencies: normalizedDependencies,
      capability_assessment: compactValue(scan.capability_assessment, 3, 2_400),
      security_dimensions: compactValue(scan.security_dimensions, 3, 2_400),
      manifest: compactValue(scan.manifest, 2, 2_400),
    },
  };

  let serialized = JSON.stringify(base);
  if (serialized.length > EVIDENCE_INTELLIGENCE_MAX_CONTEXT_CHARS) {
    const bounded = {
      ...base,
      report_detail: {
        ...base.report_detail,
        findings: normalizedFindings.slice(0, 36),
        files: normalizedFiles.slice(0, 60),
        dependencies: normalizedDependencies.slice(0, 36),
      },
      omitted_fields: [...omittedFields, "context was reduced to the final bounded prompt size"],
    };
    serialized = JSON.stringify(bounded);
  }

  const includedRefs = evidence.map((item) => item.ref);
  return {
    ...base,
    evidence: evidence.filter((item) => includedRefs.includes(item.ref)),
    serialized,
    context_digest: createHash("sha256").update(serialized).digest("hex"),
    evidence_refs: includedRefs,
  };
}

export function signEvidenceIntelligenceContext(context: EvidenceIntelligenceContext): EvidenceIntelligenceTicket {
  const serialized = context.serialized;
  const contextDigest = context.context_digest;
  const secret = contextSigningSecret();
  return {
    serialized,
    context_digest: contextDigest,
    signature: secret ? createHmac("sha256", secret).update(ticketPayload(serialized, contextDigest)).digest("hex") : "",
  };
}

export function verifyEvidenceIntelligenceTicket(ticket: EvidenceIntelligenceTicket): EvidenceIntelligenceContext | null {
  if (!ticket || typeof ticket.serialized !== "string" || ticket.serialized.length > EVIDENCE_INTELLIGENCE_MAX_CONTEXT_CHARS || !/^[a-f0-9]{64}$/i.test(ticket.context_digest) || !/^[a-f0-9]{64}$/i.test(ticket.signature)) return null;
  const secret = contextSigningSecret();
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(ticketPayload(ticket.serialized, ticket.context_digest)).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(ticket.signature))) return null;
  if (createHash("sha256").update(ticket.serialized).digest("hex") !== ticket.context_digest.toLowerCase()) return null;
  try {
    const context = JSON.parse(ticket.serialized) as EvidenceIntelligenceContext;
    const evidenceRefs = Array.isArray(context.evidence) ? context.evidence.map((reference) => reference.ref).filter((ref): ref is string => typeof ref === "string") : [];
    return { ...context, serialized: ticket.serialized, context_digest: ticket.context_digest.toLowerCase(), evidence_refs: evidenceRefs };
  } catch {
    return null;
  }
}

function contextSigningSecret(): string {
  return runtimeEnv("SARVAM_CONTEXT_SIGNING_SECRET").trim() || runtimeEnv("SARVAM_API_KEY").trim();
}

function ticketPayload(serialized: string, contextDigest: string): string {
  return `${contextDigest.toLowerCase()}.${serialized}`;
}

export function deriveAccessSurface(
  capabilityRecords: Array<{ key: string; source: "observed" | "detected"; evidence_ref: string }>,
  findings: RecordValue[],
  addEvidence: (reference: EvidenceReference) => void,
): AccessSurfaceEntry[] {
  const entries = new Map<string, AccessSurfaceEntry>();
  const add = (key: string, source: "observed" | "detected", evidenceRefs: string[], labelOverride?: string) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_ -]/g, " ").replace(/\s+/g, "_");
    const rule = CAPABILITY_RULES.find((candidate) => candidate.matches.some((match) => normalized.includes(match)));
    const id = rule?.asset || `unknown_${slug(normalized) || "capability"}`;
    if (!rule) {
      const existing = entries.get(id);
      if (existing) existing.evidence_refs = uniqueStrings([...existing.evidence_refs, ...evidenceRefs]);
      else entries.set(id, { id, asset: "unknown_capability", asset_label: labelOverride || "Unclassified capability", operation: `scanner-recorded capability: ${safeText(key, 180)}`, scope: "not classified by the current capability taxonomy", status: "not_classified", preconditions: ["The trigger or precondition was not normalized by the scanner."], evidence_refs: uniqueStrings(evidenceRefs) });
      return;
    }
    const existing = entries.get(id);
    if (existing) {
      existing.evidence_refs = uniqueStrings([...existing.evidence_refs, ...evidenceRefs]);
      if (source === "observed") existing.status = "observed";
      return;
    }
    entries.set(id, { id, asset: rule.asset, asset_label: rule.asset_label, operation: rule.operation, scope: rule.scope, status: source, preconditions: ["The exact activation trigger was not available in the normalized report."], evidence_refs: uniqueStrings(evidenceRefs) });
  };

  for (const capability of capabilityRecords) add(capability.key, capability.source, [capability.evidence_ref]);
  for (const [index, finding] of findings.slice(0, MAX_FINDINGS).entries()) {
    const keys = [finding.rule_id, finding.category].filter((value): value is string => typeof value === "string" && Boolean(value));
    const findingRefs = [findingReference(finding, index)];
    for (const key of keys) {
      const normalized = key.toLowerCase();
      if (CAPABILITY_RULES.some((candidate) => candidate.matches.some((match) => normalized.includes(match)))) add(key, "detected", findingRefs);
    }
  }

  for (const entry of entries.values()) {
    for (const ref of entry.evidence_refs) {
      if (!ref.startsWith("capability.") && !ref.startsWith("finding.")) continue;
      addEvidence({ ref, kind: ref.startsWith("finding.") ? "finding" : "capability", label: entry.asset_label, detail: entry.operation, section: ref.startsWith("finding.") ? "alerts" : "capabilities" });
    }
  }
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function deriveBlastRadius(
  accessSurface: AccessSurfaceEntry[],
  findings: RecordValue[],
  dependencies: RecordValue[],
  scan: RecordValue,
  addEvidence: (reference: EvidenceReference) => void,
): BlastRadiusAssessment {
  const findingRefs = findings.slice(0, MAX_FINDINGS).map((finding, index) => findingReference(finding, index));
  const capabilityRefs = accessSurface.flatMap((entry) => entry.evidence_refs);
  const refs = uniqueStrings(["scan.identity", "scan.coverage", ...capabilityRefs, ...findingRefs]);
  const hasCoverage = finiteNumber(scan.coverage_percent) !== null;
  const precondition = "Actual impact depends on activation, user actions, workspace trust, host permissions, and the extension's runtime path; those conditions are not fully established by static evidence.";
  const unknown = (summary: string): BlastRadiusDimension => ({ level: "unknown", summary, preconditions: [precondition], evidence_refs: refs.slice(0, 8) });
  const noneOrUnknown = (summary: string): BlastRadiusDimension => hasCoverage && accessSurface.length && !accessSurface.some((entry) => entry.asset === "unknown_capability") ? { level: "none", summary, preconditions: [precondition], evidence_refs: ["scan.coverage", "scan.identity"] } : unknown(summary);
  const dimension = (name: keyof BlastRadiusAssessment["dimensions"]): BlastRadiusDimension => {
    const relevant = accessSurface.filter((entry) => CAPABILITY_RULES.some((rule) => rule.asset === entry.asset && rule.dimensions.includes(name)));
    if (!relevant.length) return noneOrUnknown(`No classified ${name.replaceAll("_", " ")} path was recorded; this is not proof that the path is impossible.`);
    const evidenceRefs = uniqueStrings(relevant.flatMap((entry) => entry.evidence_refs));
    const level = levelForDimension(name, relevant, dependencies);
    const summary = `${relevant.map((entry) => entry.asset_label).join(", ")} can affect ${name.replaceAll("_", " ")} within the stated scope, based on scanner-recorded capability evidence.`;
    return { level, summary, preconditions: [precondition], evidence_refs: evidenceRefs.slice(0, 8) };
  };
  const dimensions = {
    confidentiality: dimension("confidentiality"),
    integrity: dimension("integrity"),
    availability: dimension("availability"),
    network: dimension("network"),
    persistence: dimension("persistence"),
    supply_chain: dependencies.length ? dimension("supply_chain") : unknown("No dependency inventory was supplied for this report."),
  };
  const knownLevels = Object.values(dimensions).map((item) => item.level).filter((level) => level !== "unknown");
  const overall = knownLevels.length ? knownLevels.reduce<BlastRadiusLevel>((current, level) => LEVEL_RANK[level] > LEVEL_RANK[current] ? level : current, "none") : "unknown";
  for (const [name, item] of Object.entries(dimensions)) addEvidence({ ref: `blast.${name}`, kind: "scan", label: `${name.replaceAll("_", " ")} blast radius`, detail: item.summary, section: "overview" });
  return { overall, dimensions, evidence_refs: uniqueStrings([...refs, ...Object.keys(dimensions).map((name) => `blast.${name}`)]).slice(0, 24) };
}

export function validateIntelligenceNarrative(value: unknown, context: EvidenceIntelligenceContext): IntelligenceNarrativeDraft {
  const input = objectValue(value);
  const allowedRefs = new Set(context.evidence_refs);
  const aliases = evidenceRefAliases(context);
  const headline = requiredText(input.headline, 300);
  const bottomLine = requiredText(input.bottom_line, 700);
  const summaryRefs = validatedRefs(input.summary_evidence_refs, allowedRefs, aliases, 8, true);
  const claims = validateClaims(input.claims, allowedRefs, aliases, 10, false);
  const positiveSignals = validateClaims(input.positive_signals, allowedRefs, aliases, 4, false);
  const unknowns = validateClaims(input.unknowns, allowedRefs, aliases, 6, true);
  const verifyNext = validateActions(input.verify_next, allowedRefs, aliases, 4);
  const allClaims = [...claims, ...positiveSignals, ...unknowns];
  if (new Set(allClaims.map((claim) => claim.claim_id)).size !== allClaims.length) throw new EvidenceIntelligenceValidationError("The intelligence report reused a claim identifier.");
  rejectOverclaim(`${headline}\n${bottomLine}`);
  rejectDecisionMutation([headline, bottomLine, ...claims, ...positiveSignals, ...unknowns, ...verifyNext].map((item) => typeof item === "string" ? item : item.text).join("\n"), context.deterministic.decision);
  if (!claims.length) throw new EvidenceIntelligenceValidationError("The intelligence report did not contain any grounded claims.");
  if (!summaryRefs.length) throw new EvidenceIntelligenceValidationError("The intelligence summary was not tied to report evidence.");
  return { headline, bottom_line: bottomLine, summary_evidence_refs: summaryRefs, claims, positive_signals: positiveSignals, unknowns, verify_next: verifyNext };
}

export function assembleEvidenceIntelligenceReport(
  context: EvidenceIntelligenceContext,
  narrative: IntelligenceNarrativeDraft,
  metadata: { model: string; audience: IntelligenceAudience; depth: IntelligenceDepth; generated_at: string },
): EvidenceIntelligenceReport {
  const claimsWithEvidence = narrative.claims.filter((claim) => claim.evidence_refs.length).length + narrative.positive_signals.filter((claim) => claim.evidence_refs.length).length + narrative.unknowns.filter((claim) => claim.evidence_refs.length).length + narrative.verify_next.filter((item) => item.evidence_refs.length).length;
  return {
    schema_version: EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
    generated_at: metadata.generated_at,
    model: metadata.model,
    audience: metadata.audience,
    depth: metadata.depth,
    context_digest: context.context_digest,
    identity: context.identity,
    deterministic: { ...context.deterministic, decision_unchanged: true },
    narrative,
    access_surface: context.access_surface,
    data_flow: context.data_flow,
    blast_radius: context.blast_radius,
    release_delta: context.release_delta,
    evidence: context.evidence,
    report_inventory: context.report_inventory,
    coverage_boundaries: context.coverage_boundaries,
    omitted_fields: context.omitted_fields,
    validation: { status: "validated", claims_with_evidence: claimsWithEvidence, generated_at: metadata.generated_at },
  };
}

function normalizeCapabilityRecords(scan: RecordValue): Array<{ key: string; source: "observed" | "detected"; evidence_ref: string }> {
  const records: Array<{ key: string; source: "observed" | "detected"; evidence_ref: string }> = [];
  const capabilities = scan.capabilities;
  if (Array.isArray(capabilities)) {
    for (const [index, value] of capabilities.entries()) {
      const item = objectValue(value);
      const key = safeText(item.id || item.name || item.capability, 150);
      if (key) records.push({ key, source: "observed", evidence_ref: `capability.${slug(key)}.${index + 1}` });
    }
  } else {
    for (const [index, [key, value]] of Object.entries(objectValue(capabilities)).entries()) {
      if (value === false || value === null || value === undefined) continue;
      records.push({ key, source: "observed", evidence_ref: `capability.${slug(key)}.${index + 1}` });
    }
  }
  const assessment = objectValue(scan.capability_assessment);
  const matched = Array.isArray(assessment.matched) ? assessment.matched : [];
  for (const [index, value] of matched.entries()) {
    const key = safeText(value, 150);
    if (key && !records.some((record) => record.key.toLowerCase() === key.toLowerCase())) records.push({ key, source: "detected", evidence_ref: `capability.${slug(key)}.${index + 1}` });
  }
  return records.slice(0, 80);
}

function buildDataFlow(extensionId: string, accessSurface: AccessSurfaceEntry[]): { nodes: DataFlowNode[]; edges: DataFlowEdge[] } {
  const nodes: DataFlowNode[] = [{ id: "extension", label: extensionId, kind: "extension", evidence_refs: ["scan.identity"] }];
  const edges: DataFlowEdge[] = [];
  for (const entry of accessSurface) {
    const nodeId = `asset.${entry.id}`;
    const kind = entry.asset === "external_services" ? "external" : entry.asset === "unknown_capability" ? "unknown" : "asset";
    nodes.push({ id: nodeId, label: entry.asset_label, kind, evidence_refs: entry.evidence_refs });
    edges.push({ id: `flow.${entry.id}`, from: "extension", to: nodeId, action: entry.operation, evidence_refs: entry.evidence_refs });
  }
  return { nodes, edges };
}

function deriveReleaseDelta(scan: RecordValue, currentVersion: string, addEvidence: (reference: EvidenceReference) => void): ReleaseDelta {
  const raw = objectValue(scan.baseline_diff);
  const baselineVersion = safeText(raw.from_version || raw.baseline_version || raw.from, 140) || null;
  const added = collectDeltaLabels(raw, "added");
  const removed = collectDeltaLabels(raw, "removed");
  const unchanged = collectDeltaLabels(raw, "unchanged");
  const available = Boolean(baselineVersion && (added.length || removed.length || unchanged.length || raw.comparable === true));
  if (available) addEvidence({ ref: "scan.baseline", kind: "scan", label: "Release comparison", detail: `${baselineVersion} → ${currentVersion}`, section: "changes" });
  return { available, baseline_version: baselineVersion, current_version: currentVersion, summary: available ? `${baselineVersion} → ${currentVersion} normalized release evidence is available.` : "No comparable baseline evidence was supplied for this exact report.", added: added.slice(0, 20), removed: removed.slice(0, 20), unchanged: unchanged.slice(0, 20), evidence_refs: available ? ["scan.baseline"] : ["scan.identity"] };
}

function collectDeltaLabels(value: RecordValue, key: string): string[] {
  const result: string[] = [];
  const raw = value[key];
  if (Array.isArray(raw)) for (const item of raw) result.push(typeof item === "string" ? safeText(item, 180) : safeText(objectValue(item).name || objectValue(item).path || objectValue(item).rule_id, 180));
  else if (raw && typeof raw === "object") for (const [name, items] of Object.entries(raw as RecordValue)) if (Array.isArray(items)) result.push(...items.slice(0, 20).map((item) => `${name}: ${typeof item === "string" ? safeText(item, 160) : safeText(objectValue(item).name || objectValue(item).path || objectValue(item).rule_id, 160)}`));
  return result.filter(Boolean).slice(0, 20);
}

function levelForDimension(name: keyof BlastRadiusAssessment["dimensions"], entries: AccessSurfaceEntry[], dependencies: RecordValue[]): BlastRadiusLevel {
  if (name === "confidentiality" && entries.some((entry) => entry.asset === "secrets_credentials")) return "broad";
  if (name === "integrity" && entries.some((entry) => entry.asset === "process_execution")) return "broad";
  if (name === "network" && entries.some((entry) => entry.asset === "external_services")) return "moderate";
  if (name === "supply_chain" && dependencies.some((dependency) => Array.isArray(dependency.advisories) && dependency.advisories.length > 0)) return "moderate";
  if (entries.some((entry) => entry.asset === "unknown_capability")) return "unknown";
  return "moderate";
}

function validateClaims(value: unknown, allowedRefs: Set<string>, aliases: Map<string, string>, maxItems: number, allowEmpty: boolean): IntelligenceClaim[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new EvidenceIntelligenceValidationError("The intelligence report claims were not a bounded array.");
  const result: IntelligenceClaim[] = [];
  for (const item of value) {
    const input = objectValue(item);
    const text = requiredText(input.text, 560);
    const section = input.section;
    const certainty = input.certainty;
    if (!isSection(section) || !isCertainty(certainty)) throw new EvidenceIntelligenceValidationError("The intelligence report contains an unsupported claim classification.");
    const evidenceRefs = validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, allowEmpty && certainty === "unknown");
    if (!evidenceRefs.length && !(allowEmpty && certainty === "unknown")) throw new EvidenceIntelligenceValidationError("A material intelligence claim was not tied to evidence.");
    rejectOverclaim(text);
    result.push({ claim_id: requiredText(input.claim_id, 100), section, text, certainty, evidence_refs: evidenceRefs });
  }
  if (new Set(result.map((claim) => claim.claim_id)).size !== result.length) throw new EvidenceIntelligenceValidationError("The intelligence report contained duplicate claim identifiers.");
  return result;
}

function validateActions(value: unknown, allowedRefs: Set<string>, aliases: Map<string, string>, maxItems: number): IntelligenceAction[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new EvidenceIntelligenceValidationError("The verification plan was not a bounded array.");
  return value.map((item) => {
    const input = objectValue(item);
    const text = requiredText(input.text, 420);
    const evidenceRefs = validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false);
    rejectOverclaim(text);
    return { text, evidence_refs: evidenceRefs };
  });
}

function validatedRefs(value: unknown, allowed: Set<string>, aliases: Map<string, string>, maxItems: number, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) throw new EvidenceIntelligenceValidationError("The intelligence report contained invalid evidence references.");
  const refs = value.map((item) => String(item));
  if (!allowEmpty && refs.length === 0) throw new EvidenceIntelligenceValidationError("The intelligence report omitted required evidence references.");
  const canonicalRefs = refs.map((ref) => aliases.get(ref) || ref);
  if (canonicalRefs.some((ref) => !allowed.has(ref))) throw new EvidenceIntelligenceValidationError("The intelligence report referenced evidence outside the exact report.");
  return uniqueStrings(canonicalRefs);
}

function evidenceRefAliases(context: EvidenceIntelligenceContext): Map<string, string> {
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();
  const add = (alias: string | undefined, refs: string[]) => {
    if (!alias || !refs.length || ambiguous.has(alias)) return;
    const ref = refs[0];
    const existing = aliases.get(alias);
    if (existing && existing !== ref) {
      aliases.delete(alias);
      ambiguous.add(alias);
      return;
    }
    if (!existing) aliases.set(alias, ref);
  };
  const addVariants = (alias: string | undefined, refs: string[]) => {
    if (!alias) return;
    add(alias, refs);
    add(alias.replaceAll("-", "_"), refs);
    add(alias.replace(/[._-]+/g, "_"), refs);
  };
  for (const fact of context.facts) addVariants(fact.ref, fact.evidence_refs);
  for (const entry of context.access_surface) {
    addVariants(entry.id, entry.evidence_refs);
    addVariants(`access.${entry.id}`, entry.evidence_refs);
    addVariants(`capability.${entry.id}`, entry.evidence_refs);
  }
  for (const node of context.data_flow.nodes) addVariants(node.id, node.evidence_refs);
  for (const edge of context.data_flow.edges) addVariants(edge.id, edge.evidence_refs);
  for (const [name, dimension] of Object.entries(context.blast_radius.dimensions)) addVariants(`blast_radius.${name}`, dimension.evidence_refs);
  addVariants("release_delta", context.release_delta.evidence_refs);
  const scanAliases: Record<string, string> = {
    artifact: "scan.provenance",
    artifact_sha256: "scan.provenance",
    extension_id: "scan.identity",
    scan_id: "scan.identity",
    version: "scan.identity",
    decision: "scan.decision",
    outcome: "scan.public_outcome",
    rationale: "scan.reason",
    decision_reason: "scan.reason",
    coverage: "scan.coverage",
    analysis_status: "scan.analysis_status",
    severity: "scan.severity",
    public_outcome: "scan.public_outcome",
    evidence_confidence: "scan.evidence_confidence",
    scanner_build: "scan.scanner_build",
    ruleset_version: "scan.ruleset_version",
    capabilities: "scan.capabilities",
    inventory: "scan.inventory",
  };
  for (const [alias, ref] of Object.entries(scanAliases)) addVariants(alias, [ref]);
  for (const reference of context.evidence) {
    const unindexedRef = reference.ref.replace(/\.\d+$/, "");
    addVariants(unindexedRef, [reference.ref]);
    addVariants(reference.ref, [reference.ref]);
    const [family, ...parts] = unindexedRef.split(".");
    if (family && parts.length) {
      const tail = parts.join(".");
      addVariants(tail, [reference.ref]);
      if (family === "capability") addVariants(`access.${tail}`, [reference.ref]);
    }
    const label = slug(reference.label).replaceAll("-", "_");
    addVariants(label, [reference.ref]);
    addVariants(`${reference.section}.${label}`, [reference.ref]);
  }
  return aliases;
}

function rejectOverclaim(value: string): void {
  if (/\b(?:malicious intent|is malware|will exfiltrate|remote compromise|definitely compromised|certainly compromised|steal(?:s|ing)? credentials|backdoor)\b/i.test(value)) throw new EvidenceIntelligenceValidationError("The intelligence report used an unsupported security assertion.");
}

function rejectDecisionMutation(value: string, deterministicDecision: string): void {
  const decision = deterministicDecision.toLowerCase();
  const explicit = value.match(/\b(?:decision|outcome|verdict)\s+(?:is|remains|should be|=)?\s*(allow|review|block|incomplete)\b/gi) || [];
  for (const statement of explicit) {
    const mentioned = statement.match(/\b(allow|review|block|incomplete)\b$/i)?.[1]?.toLowerCase();
    if (mentioned && mentioned !== decision) throw new EvidenceIntelligenceValidationError("The intelligence report changed the deterministic decision.");
  }
  const directive = value.match(/\b(?:allow|approve|block|reject)\s+(?:this|the)?\s*(?:release|extension|version)\b/i)?.[0]?.toLowerCase();
  if (directive && !directive.startsWith(decision === "allow" ? "allow" : decision === "block" ? "block" : "__never__")) throw new EvidenceIntelligenceValidationError("The intelligence report issued a different release decision.");
}

export class EvidenceIntelligenceValidationError extends Error {
  constructor(message = "The intelligence report did not pass evidence validation.") {
    super(message);
    this.name = "EvidenceIntelligenceValidationError";
  }
}

function deriveCoverageBoundaries(scan: RecordValue, product: RecordValue, findings: RecordValue[], files: RecordValue[]): string[] {
  const boundaries: string[] = [];
  const coverage = finiteNumber(scan.coverage_percent);
  if (coverage === null) boundaries.push("Coverage percentage was not recorded.");
  else if (coverage < 100) boundaries.push(`Only ${coverage}% of the scanner coverage target was recorded.`);
  if (!findings.length) boundaries.push("No findings were supplied; that does not prove the absence of risky behavior.");
  if (!files.length) boundaries.push("No packaged file inventory was supplied.");
  if (!product.files) boundaries.push("File inventory was not present in the report payload.");
  if (!objectValue(scan.manifest).activationEvents && !objectValue(scan.manifest).activation_events) boundaries.push("Activation triggers were not normalized in the report.");
  boundaries.push("Static evidence does not establish runtime exploitability, user intent, or actual data exfiltration.");
  return uniqueStrings(boundaries).slice(0, 12);
}

function objectValue(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function recordArray(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function safeText(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return redact(String(value)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, max);
}

function requiredText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new EvidenceIntelligenceValidationError("The intelligence report contained missing or oversized text.");
  return value.trim();
}

function safeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === "string").slice(0, maxItems).map((item) => safeText(item, maxLength)).filter(Boolean));
}

function compactValue(value: unknown, depth: number, maxChars: number): unknown {
  if (depth < 0) return "[nested value omitted]";
  if (typeof value === "string") return safeText(value, Math.min(MAX_STRING, maxChars));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => compactValue(item, depth - 1, maxChars));
  if (value && typeof value === "object") {
    const result: RecordValue = {};
    for (const [key, item] of Object.entries(value as RecordValue).slice(0, 40)) result[safeText(key, 100)] = compactValue(item, depth - 1, maxChars);
    return result;
  }
  return "";
}

function redact(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, "[REDACTED_KEY]")
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+\-/]+=*/gi, "[REDACTED_AUTH]")
    .replace(/(api[_-]?key|secret|token|password|passwd|private[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[REDACTED]@")
    .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]");
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function formatCoverage(value: unknown): string {
  const number = finiteNumber(value);
  return number === null ? "not recorded" : `${Math.max(0, Math.min(100, number))}%`;
}

function formatBytes(value: unknown): string {
  const number = finiteNumber(value);
  if (number === null) return "size unknown";
  if (number < 1024) return `${number} B`;
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`;
  return `${(number / (1024 * 1024)).toFixed(1)} MB`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "item";
}

function findingReference(finding: RecordValue, index: number): string {
  return `finding.${slug(safeText(finding.id || finding.finding_id || finding.rule_id, 120) || "item")}.${index + 1}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isCertainty(value: unknown): value is EvidenceCertainty {
  return value === "observed" || value === "bounded_inference" || value === "unknown";
}

function isSection(value: unknown): value is IntelligenceSection {
  return value === "decision" || value === "access_surface" || value === "data_flow" || value === "blast_radius" || value === "release_delta" || value === "context";
}
