import { describe, expect, it } from "vitest";
import {
  compileEvidenceIntelligenceContext,
  deriveBlastRadius,
  signEvidenceIntelligenceContext,
  validateIntelligenceNarrative,
  verifyEvidenceIntelligenceTicket,
  EvidenceIntelligenceValidationError,
} from "@/lib/evidenceIntelligence";

function product(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.2.3",
    scan: {
      id: "scan-1",
      extension_id: "publisher.extension",
      version: "1.2.3",
      artifact_sha256: "a".repeat(64),
      analysis_status: "complete",
      decision: "review",
      severity: "HIGH",
      public_outcome: "investigate",
      decision_reason: "Observed network and process behavior needs review.",
      coverage_percent: 82,
      evidence_confidence: "high",
      provenance_tier: "registry-verified",
      scanner_build: "build-1",
      ruleset_version: "rules-1",
      capabilities: { network: { evidence: ["src/extension.js"] }, process_exec: true },
      capability_assessment: { matched: ["network", "process_exec"] },
      manifest: { activationEvents: ["onStartupFinished"] },
      ...overrides,
    },
    findings: [{ id: "finding-1", rule_id: "network-egress", severity: "HIGH", summary: "Outbound request from extension.js", evidence_class: "strong", actionability: "high", file_refs: ["src/extension.js"] }],
    files: [{ path: "src/extension.js", kind: "javascript", size_bytes: 1200 }],
    dependencies: [{ name: "example-package", version: "1.0.0", ecosystem: "npm", relationship: "runtime", advisories: [{ id: "CVE-1" }] }],
  };
}

describe("evidence intelligence compiler", () => {
  it("compiles a bounded, exact-report context with access and blast-radius facts", () => {
    const context = compileEvidenceIntelligenceContext(product());

    expect(context.identity).toMatchObject({ extension_id: "publisher.extension", version: "1.2.3", scan_id: "scan-1" });
    expect(context.serialized).not.toContain("canonical_report");
    expect(context.serialized).not.toContain("CVE-1");
    expect(context.access_surface.map((entry) => entry.asset)).toEqual(["external_services", "process_execution", "supply_chain"]);
    expect(context.blast_radius.dimensions.network.level).toBe("moderate");
    expect(context.blast_radius.dimensions.integrity.level).toBe("broad");
    expect(context.blast_radius.dimensions.supply_chain.level).toBe("moderate");
    expect(context.evidence_refs).toEqual(expect.arrayContaining(["scan.reason", "scan.capabilities", "scan.inventory"]));
    expect(context.coverage_boundaries).toContain("Only 82% of the scanner coverage target was recorded.");
    expect(context.context_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps unclassified capabilities visible instead of silently dropping them", () => {
    const context = compileEvidenceIntelligenceContext({ ...product({ capabilities: { weird_power: true }, capability_assessment: {} }), findings: [], dependencies: [] });
    expect(context.access_surface).toContainEqual(expect.objectContaining({ asset: "unknown_capability", status: "not_classified" }));
    expect(context.blast_radius.overall).toBe("unknown");
  });

  it("does not infer absence of access from an empty finding set", () => {
    const context = compileEvidenceIntelligenceContext({ ...product(), findings: [], dependencies: [], scan: { ...product().scan, capabilities: {}, capability_assessment: {} } });
    expect(context.blast_radius.overall).toBe("unknown");
    expect(context.coverage_boundaries).toContain("No findings were supplied; that does not prove the absence of risky behavior.");
  });
});

describe("evidence intelligence output validation", () => {
  it("accepts cited, calibrated narrative output", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const narrative = validateIntelligenceNarrative({
      headline: "Review the exact release before approval",
      bottom_line: "The scan recorded outbound network and process capabilities; the deterministic decision remains review.",
      summary_evidence_refs: ["scan.decision", "capability.network.1"],
      claims: [
        { claim_id: "claim-1", section: "access_surface", text: "Outbound network requests were recorded by the scanner.", certainty: "observed", evidence_refs: ["capability.network.1"] },
        { claim_id: "claim-2", section: "blast_radius", text: "The potential integrity impact is broad if process execution is exercised.", certainty: "bounded_inference", evidence_refs: ["capability.process-exec.2", "scan.coverage"] },
      ],
      positive_signals: [],
      unknowns: [{ claim_id: "unknown-1", section: "context", text: "Runtime activation conditions were not fully assessed.", certainty: "unknown", evidence_refs: ["scan.coverage"] }],
      verify_next: [{ text: "Confirm the expected network destination in the publisher's documentation.", evidence_refs: ["capability.network.1"] }],
    }, context);
    expect(narrative.claims).toHaveLength(2);
  });

  it("rejects a foreign evidence reference", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateIntelligenceNarrative({
      headline: "Unsupported claim",
      bottom_line: "This is not grounded.",
      summary_evidence_refs: ["finding.unknown"],
      claims: [{ claim_id: "claim-1", section: "context", text: "The extension can access everything.", certainty: "observed", evidence_refs: ["finding.unknown"] }],
      positive_signals: [],
      unknowns: [],
      verify_next: [],
    }, context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("rejects unsupported compromise and credential-theft assertions", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateIntelligenceNarrative({
      headline: "Review",
      bottom_line: "The scanner recorded a capability.",
      summary_evidence_refs: ["scan.decision"],
      claims: [{ claim_id: "claim-1", section: "blast_radius", text: "This extension will exfiltrate and steal credentials.", certainty: "bounded_inference", evidence_refs: ["capability.network.1"] }],
      positive_signals: [],
      unknowns: [],
      verify_next: [],
    }, context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("rejects a model attempt to introduce a different decision", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateIntelligenceNarrative({
      headline: "Allow this release",
      bottom_line: "The deterministic decision remains allow.",
      summary_evidence_refs: ["scan.decision"],
      claims: [{ claim_id: "claim-1", section: "decision", text: "The release is safe and should be allowed.", certainty: "observed", evidence_refs: ["scan.decision"] }],
      positive_signals: [],
      unknowns: [],
      verify_next: [],
    }, context)).toThrow(EvidenceIntelligenceValidationError);
  });
});

describe("blast-radius rules", () => {
  it("does not downgrade unknown classification because no capability was observed", () => {
    const context = compileEvidenceIntelligenceContext(product({ capabilities: {}, capability_assessment: {} }));
    const assessment = deriveBlastRadius([], [], [], context.deterministic as Record<string, unknown>, () => undefined);
    expect(assessment.overall).toBe("unknown");
    expect(assessment.dimensions.confidentiality.level).toBe("unknown");
  });
});

describe("signed context ticket", () => {
  it("accepts only an untampered context signed by the server secret", () => {
    const previous = process.env.SARVAM_API_KEY;
    process.env.SARVAM_API_KEY = "test-signing-secret";
    try {
      const context = compileEvidenceIntelligenceContext(product());
      const ticket = signEvidenceIntelligenceContext(context);
      expect(verifyEvidenceIntelligenceTicket(ticket)).toMatchObject({ context_digest: context.context_digest, identity: context.identity });
      expect(verifyEvidenceIntelligenceTicket({ ...ticket, serialized: `${ticket.serialized} ` })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = previous;
    }
  });
});
