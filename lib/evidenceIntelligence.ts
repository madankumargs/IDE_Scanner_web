import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const EVIDENCE_INTELLIGENCE_SCHEMA_VERSION = "2.0";
export const EVIDENCE_INTELLIGENCE_MAX_CONTEXT_CHARS = 30_000;

export type IntelligenceReviewGoal = "install_decision" | "flag_investigation" | "publisher_response";
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

export type ReviewerGuidePrimaryTakeaway = {
  title: string;
  statement: string;
  action: string;
  certainty: EvidenceCertainty;
  evidence_refs: string[];
};

export type ReviewerGuideChainStep = {
  step_id: string;
  role: "trigger" | "action" | "target" | "consequence";
  label: string;
  detail: string;
  evidence_refs: string[];
};

export type ReviewerGuideEventChain = {
  available: boolean;
  unavailable_reason: string;
  steps: ReviewerGuideChainStep[];
  evidence_refs: string[];
};

export type ReviewerGuideScenario = {
  scenario_id: string;
  title: string;
  when: string;
  mechanism: string;
  consequence: string;
  affected_surface: string;
  certainty: EvidenceCertainty;
  evidence_refs: string[];
};

export type ReviewerGuideChange = {
  change_id: string;
  text: string;
  evidence_refs: string[];
};

export type ReviewerGuideAction = {
  action_id: string;
  owner: "you" | "security_team" | "publisher";
  priority: "now" | "next" | "optional";
  text: string;
  evidence_refs: string[];
};

export type ReviewerGuideUnknown = {
  unknown_id: string;
  question: string;
  why_it_matters: string;
  certainty: "unknown";
  evidence_refs: string[];
};

export type ReviewerGuideDraft = {
  primary_takeaway: ReviewerGuidePrimaryTakeaway;
  event_chain: ReviewerGuideEventChain;
  scenarios: ReviewerGuideScenario[];
  release_changes: ReviewerGuideChange[];
  next_actions: ReviewerGuideAction[];
  unknowns: ReviewerGuideUnknown[];
};

export type CausalEvidenceStep = {
  role: "trigger" | "action" | "target" | "consequence";
  label: string;
  detail: string;
  evidence_refs: string[];
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
  causal_evidence: {
    available: boolean;
    steps: CausalEvidenceStep[];
    evidence_refs: string[];
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
  review_goal: IntelligenceReviewGoal;
  depth: IntelligenceDepth;
  context_digest: string;
  identity: EvidenceIntelligenceContext["identity"];
  deterministic: EvidenceIntelligenceContext["deterministic"] & {
    decision_unchanged: true;
  };
  guide: ReviewerGuideDraft;
  access_surface: AccessSurfaceEntry[];
  data_flow: EvidenceIntelligenceContext["data_flow"];
  causal_evidence: EvidenceIntelligenceContext["causal_evidence"];
  blast_radius: BlastRadiusAssessment;
  release_delta: ReleaseDelta;
  evidence: EvidenceReference[];
  report_inventory: EvidenceIntelligenceContext["report_inventory"];
  coverage_boundaries: string[];
  omitted_fields: string[];
  validation: {
    status: "validated" | "deterministic_fallback";
    source: "sarvam" | "deterministic";
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
export const REVIEWER_GUIDE_LIMITS = {
  scenarios: 3,
  release_changes: 3,
  next_actions: 3,
  unknowns: 3,
  chain_steps: 4,
  primary_title: 120,
  primary_statement: 320,
  primary_action: 220,
  item_title: 120,
  item_text: 320,
  action_text: 260,
  unknown_text: 260,
  total_chars: 6_000,
} as const;
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
  addEvidence({ ref: "scan.coverage_boundaries", kind: "coverage", label: "Coverage boundaries", detail: coverageBoundaries.join(" ").slice(0, MAX_STRING), section: "coverage" });
  const releaseDelta = deriveReleaseDelta(scan, version, addEvidence);
  const causalEvidence = deriveCausalEvidence(product, scan, addEvidence);
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
    causal_evidence: causalEvidence,
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
    return {
      ...context,
      causal_evidence: context.causal_evidence || { available: false, steps: [], evidence_refs: [] },
      serialized: ticket.serialized,
      context_digest: ticket.context_digest.toLowerCase(),
      evidence_refs: evidenceRefs,
    };
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

export function validateReviewerGuide(value: unknown, context: EvidenceIntelligenceContext): ReviewerGuideDraft {
  const input = objectValue(value);
  const allowedRefs = new Set(context.evidence_refs);
  const aliases = evidenceRefAliases(context);
  const primaryInput = objectValue(input.primary_takeaway);
  const primary: ReviewerGuidePrimaryTakeaway = {
    title: requiredText(primaryInput.title, REVIEWER_GUIDE_LIMITS.primary_title),
    statement: requiredText(primaryInput.statement, REVIEWER_GUIDE_LIMITS.primary_statement),
    action: requiredText(primaryInput.action, REVIEWER_GUIDE_LIMITS.primary_action),
    certainty: requiredCertainty(primaryInput.certainty),
    evidence_refs: validatedRefs(primaryInput.evidence_refs, allowedRefs, aliases, 6, false),
  };
  const eventChain = validateEventChain(input.event_chain, context, allowedRefs, aliases);
  const scenarios = validateScenarios(input.scenarios, allowedRefs, aliases);
  const releaseChanges = validateReleaseChanges(input.release_changes, context, allowedRefs, aliases);
  const nextActions = validateGuideActions(input.next_actions, allowedRefs, aliases);
  const unknowns = validateUnknowns(input.unknowns, allowedRefs, aliases);
  const textValues = [
    primary.title,
    primary.statement,
    primary.action,
    eventChain.unavailable_reason,
    ...eventChain.steps.flatMap((step) => [step.label, step.detail]),
    ...scenarios.flatMap((scenario) => [scenario.title, scenario.when, scenario.mechanism, scenario.consequence, scenario.affected_surface]),
    ...releaseChanges.map((change) => change.text),
    ...nextActions.map((action) => action.text),
    ...unknowns.flatMap((unknown) => [unknown.question, unknown.why_it_matters]),
  ];
  const totalChars = textValues.reduce((total, item) => total + item.length, 0);
  if (totalChars > REVIEWER_GUIDE_LIMITS.total_chars) throw new EvidenceIntelligenceValidationError("The reviewer guide exceeded the total text limit.");
  rejectOverclaim(textValues.join("\n"));
  rejectDecisionMutation(textValues.join("\n"), context.deterministic.decision);
  rejectRepeatedGuideText(textValues);
  return { primary_takeaway: primary, event_chain: eventChain, scenarios, release_changes: releaseChanges, next_actions: nextActions, unknowns };
}

export function assembleEvidenceIntelligenceReport(
  context: EvidenceIntelligenceContext,
  guide: ReviewerGuideDraft,
  metadata: { model: string; review_goal: IntelligenceReviewGoal; depth: IntelligenceDepth; generated_at: string; source?: "sarvam" | "deterministic" },
): EvidenceIntelligenceReport {
  const claimsWithEvidence = 1 + guide.event_chain.steps.length + guide.scenarios.length + guide.release_changes.length + guide.next_actions.length + guide.unknowns.length;
  const source = metadata.source || "sarvam";
  return {
    schema_version: EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
    generated_at: metadata.generated_at,
    model: metadata.model,
    review_goal: metadata.review_goal,
    depth: metadata.depth,
    context_digest: context.context_digest,
    identity: context.identity,
    deterministic: { ...context.deterministic, decision_unchanged: true },
    guide,
    access_surface: context.access_surface,
    data_flow: context.data_flow,
    causal_evidence: context.causal_evidence,
    blast_radius: context.blast_radius,
    release_delta: context.release_delta,
    evidence: context.evidence,
    report_inventory: context.report_inventory,
    coverage_boundaries: context.coverage_boundaries,
    omitted_fields: context.omitted_fields,
    validation: { status: source === "deterministic" ? "deterministic_fallback" : "validated", source, claims_with_evidence: claimsWithEvidence, generated_at: metadata.generated_at },
  };
}

export function buildDeterministicReviewFallback(
  context: EvidenceIntelligenceContext,
  reviewGoal: IntelligenceReviewGoal,
  generatedAt = new Date().toISOString(),
): EvidenceIntelligenceReport {
  const decision = context.deterministic.decision.toLowerCase();
  const decisionLabel = context.deterministic.decision.toUpperCase();
  const reason = compactReason(context.deterministic.decision_reason);
  const reasonText = reason && reason !== "No deterministic rationale was recorded." ? ` ${reason}` : "";
  const primaryByGoal: Record<IntelligenceReviewGoal, ReviewerGuidePrimaryTakeaway> = {
    install_decision: {
      title: decision === "allow" ? "This exact release cleared the scan gate" : "Pause before installing this exact release",
      statement: `GuardRails recorded ${decisionLabel} for ${context.identity.extension_id}@${context.identity.version}.${reasonText}`.trim(),
      action: decision === "allow" ? "Verify the artifact hash before installing this exact version." : "Keep this version out of the install path until the recorded decision is resolved.",
      certainty: "observed",
      evidence_refs: uniqueStrings(["scan.decision", "scan.reason"]),
    },
    flag_investigation: {
      title: "Investigate the evidence behind this release decision",
      statement: `The deterministic result for ${context.identity.extension_id}@${context.identity.version} is ${decisionLabel}.${reasonText}`.trim(),
      action: "Start with the cited decision rationale, then verify the exact artifact and report coverage.",
      certainty: "observed",
      evidence_refs: uniqueStrings(["scan.decision", "scan.reason"]),
    },
    publisher_response: {
      title: "Resolve the cited evidence before publishing this release",
      statement: `This exact release is currently ${decisionLabel} in GuardRails.${reasonText}`.trim(),
      action: "Address the cited rationale or provide release-specific evidence before requesting a new review.",
      certainty: "observed",
      evidence_refs: uniqueStrings(["scan.decision", "scan.reason"]),
    },
  };
  const scenarios: ReviewerGuideScenario[] = context.access_surface.slice(0, REVIEWER_GUIDE_LIMITS.scenarios).map((entry, index) => ({
    scenario_id: `deterministic-scenario-${index + 1}`,
    title: entry.asset_label,
    when: "If the extension exercises this recorded capability",
    mechanism: entry.operation,
    consequence: `The stated scope could be involved; actual effect depends on runtime conditions not established here.`,
    affected_surface: entry.scope,
    certainty: "bounded_inference",
    evidence_refs: entry.evidence_refs.length ? entry.evidence_refs : ["scan.capabilities"],
  }));
  const releaseChanges: ReviewerGuideChange[] = context.release_delta.available
    ? [...context.release_delta.added.map((item, index) => ({ change_id: `added-${index + 1}`, text: `Added: ${item}`, evidence_refs: ["scan.baseline"] })), ...context.release_delta.removed.map((item, index) => ({ change_id: `removed-${index + 1}`, text: `Removed: ${item}`, evidence_refs: ["scan.baseline"] }))].slice(0, REVIEWER_GUIDE_LIMITS.release_changes)
    : [];
  const fallbackOwner: ReviewerGuideAction["owner"] = reviewGoal === "publisher_response" ? "publisher" : "security_team";
  const nextActions: ReviewerGuideAction[] = [
    {
      action_id: "fallback-artifact-check",
      owner: reviewGoal === "publisher_response" ? "publisher" : "you",
      priority: "now",
      text: decision === "allow" ? "Compare the published artifact hash with this exact report before approval." : "Do not approve or install this exact version while the deterministic result is unresolved.",
      evidence_refs: uniqueStrings(["scan.decision", "scan.provenance"]),
    },
    {
      action_id: "fallback-rationale-review",
      owner: fallbackOwner,
      priority: "next",
      text: reviewGoal === "publisher_response" ? "Explain or remediate the behavior named in the decision rationale, then submit a new artifact for review." : "Open the cited decision rationale and verify it against the exact report evidence.",
      evidence_refs: ["scan.reason"],
    },
    ...(context.release_delta.available ? [{ action_id: "fallback-release-compare", owner: fallbackOwner, priority: "next" as const, text: `Compare this release with baseline ${context.release_delta.baseline_version || "the recorded baseline"}.`, evidence_refs: ["scan.baseline"] }] : [{ action_id: "fallback-coverage-review", owner: "security_team" as const, priority: "optional" as const, text: "Confirm which runtime triggers and host conditions were covered by the scan.", evidence_refs: ["scan.coverage_boundaries"] }]),
  ].slice(0, REVIEWER_GUIDE_LIMITS.next_actions);
  const unknowns = context.coverage_boundaries.slice(0, REVIEWER_GUIDE_LIMITS.unknowns).map((boundary, index) => ({
    unknown_id: `fallback-unknown-${index + 1}`,
    question: boundary,
    why_it_matters: "This boundary limits what the exact report can establish.",
    certainty: "unknown" as const,
    evidence_refs: ["scan.coverage_boundaries"],
  }));
  const guide: ReviewerGuideDraft = {
    primary_takeaway: primaryByGoal[reviewGoal],
    event_chain: { available: false, unavailable_reason: "This exact report does not contain structured trigger, action, and target evidence.", steps: [], evidence_refs: ["scan.coverage_boundaries"] },
    scenarios,
    release_changes: releaseChanges,
    next_actions: nextActions,
    unknowns,
  };
  return assembleEvidenceIntelligenceReport(context, guide, { model: "deterministic", review_goal: reviewGoal, depth: "standard", generated_at: generatedAt, source: "deterministic" });
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

function deriveCausalEvidence(product: RecordValue, scan: RecordValue, addEvidence: (reference: EvidenceReference) => void): { available: boolean; steps: CausalEvidenceStep[]; evidence_refs: string[] } {
  const source = scan.causal_chain || scan.event_chain || scan.behavior_chain || product.causal_chain || product.event_chain;
  const steps: CausalEvidenceStep[] = [];
  const roleFor = (value: unknown): CausalEvidenceStep["role"] | null => {
    const role = safeText(value, 40).toLowerCase().replaceAll("-", "_");
    if (role === "trigger" || role === "activation" || role === "entry") return "trigger";
    if (role === "action" || role === "operation" || role === "behavior") return "action";
    if (role === "target" || role === "destination" || role === "asset") return "target";
    if (role === "consequence" || role === "impact" || role === "effect") return "consequence";
    return null;
  };
  const addStep = (role: CausalEvidenceStep["role"], value: unknown) => {
    const item = objectValue(value);
    const text = typeof value === "string" ? safeText(value, 220) : safeText(item.detail || item.description || item.text || item.summary || item.value, 220);
    const label = typeof value === "string" ? text : safeText(item.label || item.name || item.title || item.type, 120);
    if (label || text) steps.push({ role, label: label || role.replaceAll("_", " "), detail: text || label, evidence_refs: ["scan.causal_evidence"] });
  };
  if (Array.isArray(source)) {
    for (const item of source.slice(0, REVIEWER_GUIDE_LIMITS.chain_steps)) {
      const input = objectValue(item);
      const role = roleFor(input.role || input.type || input.stage);
      if (role) addStep(role, item);
    }
  } else if (source && typeof source === "object") {
    const input = objectValue(source);
    for (const role of ["trigger", "action", "target", "consequence"] as const) {
      const value = input[role] || input[`${role}_event`] || input[`${role}_description`];
      if (value !== undefined) addStep(role, value);
    }
  }
  const roles = new Set(steps.map((step) => step.role));
  const available = roles.has("trigger") && roles.has("action") && (roles.has("target") || roles.has("consequence"));
  if (!available) return { available: false, steps: [], evidence_refs: [] };
  addEvidence({ ref: "scan.causal_evidence", kind: "scan", label: "Structured causal evidence", detail: steps.map((step) => `${step.role}: ${step.label}`).join(" → ").slice(0, MAX_STRING), section: "alerts" });
  return { available: true, steps, evidence_refs: ["scan.causal_evidence"] };
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

function validateEventChain(value: unknown, context: EvidenceIntelligenceContext, allowedRefs: Set<string>, aliases: Map<string, string>): ReviewerGuideEventChain {
  const input = objectValue(value);
  if (typeof input.available !== "boolean") throw new EvidenceIntelligenceValidationError("The event-chain availability was invalid.");
  const unavailableReason = requiredText(input.unavailable_reason, 260);
  const stepsInput = input.steps;
  if (!Array.isArray(stepsInput) || stepsInput.length > REVIEWER_GUIDE_LIMITS.chain_steps) throw new EvidenceIntelligenceValidationError("The event chain was not a bounded array.");
  const evidenceRefs = validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false);
  if (!input.available) {
    if (stepsInput.length) throw new EvidenceIntelligenceValidationError("An unavailable event chain must not contain generated steps.");
    return { available: false, unavailable_reason: unavailableReason, steps: [], evidence_refs: evidenceRefs };
  }
  if (!context.causal_evidence.available || stepsInput.length < 2) throw new EvidenceIntelligenceValidationError("The report does not contain enough structured evidence for a causal chain.");
  const causalRefs = new Set(context.causal_evidence.evidence_refs);
  const steps = stepsInput.map((item) => {
    const step = objectValue(item);
    const role = step.role;
    if (role !== "trigger" && role !== "action" && role !== "target" && role !== "consequence") throw new EvidenceIntelligenceValidationError("The event chain contained an unsupported step role.");
    const refs = validatedRefs(step.evidence_refs, allowedRefs, aliases, 6, false);
    if (!refs.some((ref) => causalRefs.has(ref))) throw new EvidenceIntelligenceValidationError("An event-chain step was not tied to structured causal evidence.");
    return { step_id: requiredText(step.step_id, 80), role: role as ReviewerGuideChainStep["role"], label: requiredText(step.label, REVIEWER_GUIDE_LIMITS.item_title), detail: requiredText(step.detail, REVIEWER_GUIDE_LIMITS.item_text), evidence_refs: refs };
  });
  const roles = new Set(steps.map((step) => step.role));
  if (!roles.has("trigger") || !roles.has("action") || (!roles.has("target") && !roles.has("consequence"))) throw new EvidenceIntelligenceValidationError("The event chain omitted a required causal role.");
  return { available: true, unavailable_reason: unavailableReason, steps, evidence_refs: evidenceRefs };
}

function validateScenarios(value: unknown, allowedRefs: Set<string>, aliases: Map<string, string>): ReviewerGuideScenario[] {
  if (!Array.isArray(value) || value.length > REVIEWER_GUIDE_LIMITS.scenarios) throw new EvidenceIntelligenceValidationError("The reviewer scenarios were not a bounded array.");
  return value.map((item) => {
    const input = objectValue(item);
    const certainty = requiredCertainty(input.certainty);
    const evidenceRefs = validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false);
    const scenario = {
      scenario_id: requiredText(input.scenario_id, 80),
      title: requiredText(input.title, REVIEWER_GUIDE_LIMITS.item_title),
      when: requiredText(input.when, REVIEWER_GUIDE_LIMITS.item_text),
      mechanism: requiredText(input.mechanism, REVIEWER_GUIDE_LIMITS.item_text),
      consequence: requiredText(input.consequence, REVIEWER_GUIDE_LIMITS.item_text),
      affected_surface: requiredText(input.affected_surface, REVIEWER_GUIDE_LIMITS.item_text),
      certainty,
      evidence_refs: evidenceRefs,
    };
    return scenario;
  });
}

function validateReleaseChanges(value: unknown, context: EvidenceIntelligenceContext, allowedRefs: Set<string>, aliases: Map<string, string>): ReviewerGuideChange[] {
  if (!Array.isArray(value) || value.length > REVIEWER_GUIDE_LIMITS.release_changes) throw new EvidenceIntelligenceValidationError("The release changes were not a bounded array.");
  if (value.length && !context.release_delta.available) throw new EvidenceIntelligenceValidationError("Release changes were generated without a comparable baseline.");
  return value.map((item) => {
    const input = objectValue(item);
    const evidenceRefs = validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false);
    if (!evidenceRefs.includes("scan.baseline")) throw new EvidenceIntelligenceValidationError("A release change was not tied to the baseline evidence.");
    return { change_id: requiredText(input.change_id, 80), text: requiredText(input.text, REVIEWER_GUIDE_LIMITS.item_text), evidence_refs: evidenceRefs };
  });
}

function validateGuideActions(value: unknown, allowedRefs: Set<string>, aliases: Map<string, string>): ReviewerGuideAction[] {
  if (!Array.isArray(value) || value.length > REVIEWER_GUIDE_LIMITS.next_actions) throw new EvidenceIntelligenceValidationError("The next-action list was not a bounded array.");
  return value.map((item) => {
    const input = objectValue(item);
    if (input.owner !== "you" && input.owner !== "security_team" && input.owner !== "publisher") throw new EvidenceIntelligenceValidationError("The next action contained an unsupported owner.");
    if (input.priority !== "now" && input.priority !== "next" && input.priority !== "optional") throw new EvidenceIntelligenceValidationError("The next action contained an unsupported priority.");
    return { action_id: requiredText(input.action_id, 80), owner: input.owner, priority: input.priority, text: requiredText(input.text, REVIEWER_GUIDE_LIMITS.action_text), evidence_refs: validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false) };
  });
}

function validateUnknowns(value: unknown, allowedRefs: Set<string>, aliases: Map<string, string>): ReviewerGuideUnknown[] {
  if (!Array.isArray(value) || value.length > REVIEWER_GUIDE_LIMITS.unknowns) throw new EvidenceIntelligenceValidationError("The unknowns list was not a bounded array.");
  return value.map((item) => {
    const input = objectValue(item);
    const certainty = requiredCertainty(input.certainty);
    if (certainty !== "unknown") throw new EvidenceIntelligenceValidationError("An unknown must be marked unknown.");
    return { unknown_id: requiredText(input.unknown_id, 80), question: requiredText(input.question, REVIEWER_GUIDE_LIMITS.unknown_text), why_it_matters: requiredText(input.why_it_matters, REVIEWER_GUIDE_LIMITS.unknown_text), certainty, evidence_refs: validatedRefs(input.evidence_refs, allowedRefs, aliases, 6, false) };
  });
}

function requiredCertainty(value: unknown): EvidenceCertainty {
  if (!isCertainty(value)) throw new EvidenceIntelligenceValidationError("The reviewer guide contained an unsupported certainty.");
  return value;
}

function rejectRepeatedGuideText(values: string[]): void {
  const sentences = values.flatMap((value) => value.split(/[.!?]+/).map((sentence) => normalizeGuideText(sentence)).filter((sentence) => sentence.length >= 24));
  if (new Set(sentences).size !== sentences.length) throw new EvidenceIntelligenceValidationError("The reviewer guide repeated the same conclusion.");
  const primary = tokenizeGuideText(values[1]);
  for (const sentence of sentences.slice(1)) {
    const tokens = tokenizeGuideText(sentence);
    if (primary.length >= 5 && tokens.length >= 5) {
      const shared = tokens.filter((token) => primary.includes(token)).length;
      if (shared / Math.min(primary.length, tokens.length) >= 0.85) throw new EvidenceIntelligenceValidationError("The reviewer guide repeated the primary takeaway.");
    }
  }
  if (values.some((value) => /\b(?:this report provides|valuable insights|it is important to note|in conclusion|potential blast radius)\b/i.test(value))) throw new EvidenceIntelligenceValidationError("The reviewer guide used generic narrative boilerplate.");
}

function normalizeGuideText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeGuideText(value: string): string[] {
  return [...new Set(normalizeGuideText(value).split(" ").filter((token) => token.length > 2))];
}

function validatedRefs(value: unknown, allowed: Set<string>, aliases: Map<string, string>, maxItems: number, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) throw new EvidenceIntelligenceValidationError("The intelligence report contained invalid evidence references.");
  const refs = value.map((item) => String(item));
  if (!allowEmpty && refs.length === 0) throw new EvidenceIntelligenceValidationError("The intelligence report omitted required evidence references.");
  const canonicalRefs = refs.map((ref) => aliases.get(ref) || aliases.get(ref.replace(/\.\d+$/, "")) || ref);
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

function compactReason(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trimEnd()}…` : firstSentence;
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
