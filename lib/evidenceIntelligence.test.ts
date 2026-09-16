import { describe, expect, it } from "vitest";
import {
  compileEvidenceIntelligenceContext,
  buildDeterministicReviewFallback,
  deriveBlastRadius,
  signEvidenceIntelligenceContext,
  validateReviewerGuide,
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
    expect(context.evidence_refs).toContain("scan.coverage_boundaries");
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
  function guide(overrides: Record<string, unknown> = {}) {
    return {
      primary_takeaway: {
        title: "Pause before approval",
        statement: "This exact release has a deterministic review result.",
        action: "Verify the cited rationale before approval.",
        certainty: "observed",
        evidence_refs: ["scan.decision", "scan.reason"],
      },
      event_chain: {
        available: false,
        unavailable_reason: "The report does not contain a complete structured causal chain.",
        steps: [],
        evidence_refs: ["scan.coverage_boundaries"],
      },
      scenarios: [{
        scenario_id: "scenario-1",
        title: "Network and external services",
        when: "If the extension exercises the recorded capability",
        mechanism: "make outbound network requests",
        consequence: "The stated external scope could be involved; actual effect is not established.",
        affected_surface: "external destinations reachable by the host",
        certainty: "bounded_inference",
        evidence_refs: ["capability.network.1"],
      }],
      release_changes: [],
      next_actions: [{ action_id: "action-1", owner: "security_team", priority: "next", text: "Verify the cited rationale against the exact report.", evidence_refs: ["scan.reason"] }],
      unknowns: [{ unknown_id: "unknown-1", question: "Which runtime trigger activates the capability?", why_it_matters: "Activation conditions limit what the static report can establish.", certainty: "unknown", evidence_refs: ["scan.coverage_boundaries"] }],
      ...overrides,
    };
  }

  it("accepts a concise cited reviewer guide", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const reviewerGuide = validateReviewerGuide(guide(), context);
    expect(reviewerGuide.scenarios).toHaveLength(1);
    expect(reviewerGuide.next_actions).toHaveLength(1);
  });

  it("accepts an unavailable causal chain without inventing a causal reference", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const reviewerGuide = validateReviewerGuide(guide({ event_chain: {
      available: false,
      unavailable_reason: "The report does not contain a complete structured causal chain.",
      steps: [],
      evidence_refs: [],
    } }), context);
    expect(reviewerGuide.event_chain).toMatchObject({ available: false, evidence_refs: [] });
  });

  it("canonicalizes model references to validated access-surface evidence", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const reviewerGuide = validateReviewerGuide(guide({ scenarios: [{ ...guide().scenarios[0], evidence_refs: ["external_services"] }] }), context);
    expect(reviewerGuide.scenarios[0].evidence_refs).toEqual(["capability.network.1"]);
  });

  it("canonicalizes capability prefixes and unindexed catalog refs without widening evidence", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const reviewerGuide = validateReviewerGuide(guide({ scenarios: [{ ...guide().scenarios[0], evidence_refs: ["access.network"] }] }), context);
    expect(reviewerGuide.scenarios[0].evidence_refs).toEqual(["capability.network.1"]);
  });

  it("rejects a foreign evidence reference", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateReviewerGuide(guide({ primary_takeaway: { ...guide().primary_takeaway, evidence_refs: ["finding.unknown"] } }), context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("rejects unsupported compromise and credential-theft assertions", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateReviewerGuide(guide({ scenarios: [{ ...guide().scenarios[0], consequence: "This extension will exfiltrate and steal credentials." }] }), context)).toThrow(EvidenceIntelligenceValidationError);
    expect(() => validateReviewerGuide(guide({ scenarios: [{ ...guide().scenarios[0], consequence: "This behavior could indicate a backdoor." }] }), context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("allows explicit uncertainty boundaries about unsupported security conclusions", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const reviewerGuide = validateReviewerGuide(guide({
      primary_takeaway: {
        ...guide().primary_takeaway,
        statement: "The evidence does not establish malicious intent or confirmed malware.",
      },
    }), context);
    expect(reviewerGuide.primary_takeaway.statement).toContain("does not establish");
  });

  it("rejects a model attempt to introduce a different decision", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateReviewerGuide(guide({ primary_takeaway: { ...guide().primary_takeaway, statement: "The decision is allow and approve this release." } }), context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("does not accept a causal chain when structured causal evidence is absent", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateReviewerGuide(guide({ event_chain: { available: true, unavailable_reason: "", steps: [{ step_id: "one", role: "trigger", label: "Startup", detail: "Starts", evidence_refs: ["scan.reason"] }, { step_id: "two", role: "action", label: "Executes", detail: "Runs", evidence_refs: ["scan.reason"] }, { step_id: "three", role: "target", label: "Host", detail: "Host", evidence_refs: ["scan.reason"] }], evidence_refs: ["scan.reason"] } }), context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("rejects repeated primary conclusions and invented release changes", () => {
    const context = compileEvidenceIntelligenceContext(product());
    expect(() => validateReviewerGuide(guide({ next_actions: [{ action_id: "action-1", owner: "you", priority: "now", text: "This exact release has a deterministic review result.", evidence_refs: ["scan.decision"] }] }), context)).toThrow(EvidenceIntelligenceValidationError);
    expect(() => validateReviewerGuide(guide({ release_changes: [{ change_id: "change-1", text: "The capability changed in this release.", evidence_refs: ["scan.identity"] }] }), context)).toThrow(EvidenceIntelligenceValidationError);
  });

  it("accepts a causal chain only when the scanner supplied structured roles", () => {
    const context = compileEvidenceIntelligenceContext(product({ event_chain: [
      { role: "trigger", label: "Startup", detail: "The extension activates at startup." },
      { role: "action", label: "Download", detail: "The extension downloads a package." },
      { role: "target", label: "Local host", detail: "The package reaches the local host." },
    ] }));
    const reviewerGuide = validateReviewerGuide(guide({ event_chain: {
      available: true,
      unavailable_reason: "Not applicable when structured causal evidence is present.",
      steps: [
        { step_id: "step-1", role: "trigger", label: "Startup", detail: "The extension activates at startup.", evidence_refs: ["scan.causal_evidence"] },
        { step_id: "step-2", role: "action", label: "Download", detail: "The extension downloads a package.", evidence_refs: ["scan.causal_evidence"] },
        { step_id: "step-3", role: "target", label: "Local host", detail: "The package reaches the local host.", evidence_refs: ["scan.causal_evidence"] },
      ],
      evidence_refs: ["scan.causal_evidence"],
    } }), context);
    expect(context.causal_evidence.available).toBe(true);
    expect(reviewerGuide.event_chain.steps).toHaveLength(3);
  });

  it("accepts release changes only when a comparable baseline exists", () => {
    const context = compileEvidenceIntelligenceContext(product({ baseline_diff: { from_version: "1.2.2", added: ["network access"] } }));
    const reviewerGuide = validateReviewerGuide(guide({ release_changes: [{ change_id: "change-1", text: "Added: network access", evidence_refs: ["scan.baseline"] }] }), context);
    expect(context.release_delta.available).toBe(true);
    expect(reviewerGuide.release_changes[0].evidence_refs).toEqual(["scan.baseline"]);
  });

  it("falls back to a short deterministic guide without provider text", () => {
    const context = compileEvidenceIntelligenceContext(product());
    const report = buildDeterministicReviewFallback(context, "install_decision");
    expect(report.validation).toMatchObject({ status: "deterministic_fallback", source: "deterministic" });
    expect(report.guide.event_chain.available).toBe(false);
    expect(report.guide.next_actions.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(report)).not.toContain("chain-of-thought");
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
      expect(verifyEvidenceIntelligenceTicket(ticket)).toMatchObject({ context_digest: context.context_digest, identity: context.identity, evidence_refs: context.evidence_refs });
      expect(verifyEvidenceIntelligenceTicket({ ...ticket, serialized: `${ticket.serialized} ` })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.SARVAM_API_KEY;
      else process.env.SARVAM_API_KEY = previous;
    }
  });
});
