import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReviewEvidence,
  createEvidenceReviewBrief,
  createEvidenceIntelligenceReport,
  parseEvidenceReviewBrief,
  selectedSarvamModel,
  SarvamConfigurationError,
  SarvamOutputError,
} from "@/lib/sarvam";
import { compileEvidenceIntelligenceContext } from "@/lib/evidenceIntelligence";

const originalApiKey = process.env.SARVAM_API_KEY;
const originalModel = process.env.SARVAM_REASONING_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.SARVAM_API_KEY;
  else process.env.SARVAM_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.SARVAM_REASONING_MODEL;
  else process.env.SARVAM_REASONING_MODEL = originalModel;
});

describe("Sarvam evidence boundary", () => {
  it("projects only bounded facts and redacts credential-like values", () => {
    const result = buildReviewEvidence({
      extensionId: "publisher.extension",
      version: "1.2.3",
      scanId: "scan-1",
      scan: {
        decision: "review",
        decision_reason: "Uses TOKEN=super-secret to connect.",
        capabilities: { network: true },
        capability_assessment: { matched: ["network", "terminal"] },
      },
      findings: [{ rule_id: "network-egress", summary: "Authorization: Bearer abc-secret-value" }],
      dependencies: [{ name: "package", version: "1.0.0", advisories: [{ id: "CVE-1" }] }],
    });

    expect(result.serialized).toContain("[REDACTED_AUTH]");
    expect(result.serialized).toContain("TOKEN=[REDACTED]");
    expect(result.serialized).not.toContain("super-secret");
    expect(result.serialized).not.toContain("canonical_report");
    expect(result.evidenceRefs).toEqual(["finding-1"]);
  });

  it("rejects a model reference that is not tied to submitted evidence", () => {
    expect(() => parseEvidenceReviewBrief({
      headline: "Review the release",
      what_changed: [],
      why_it_matters: [],
      verify_next: [],
      uncertainties: [],
      evidence_refs: ["finding-99"],
    }, ["finding-1"])).toThrow(SarvamOutputError);
  });

  it("allows only configured reasoning models", () => {
    delete process.env.SARVAM_REASONING_MODEL;
    expect(selectedSarvamModel()).toBe("sarvam-105b");
    process.env.SARVAM_REASONING_MODEL = "not-a-model";
    expect(() => selectedSarvamModel()).toThrow(SarvamConfigurationError);
  });

  it("uses structured output and discards any separate reasoning trace", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_REASONING_MODEL = "sarvam-105b";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          reasoning_content: "This must never be returned to the application.",
          content: JSON.stringify({
            headline: "Network behavior needs context",
            what_changed: ["Network behavior was observed."],
            why_it_matters: ["A reviewer should confirm the destination is expected."],
            verify_next: ["Compare the destination with the publisher documentation."],
            uncertainties: [],
            evidence_refs: ["finding-1"],
          }),
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEvidenceReviewBrief({
      extensionId: "publisher.extension",
      version: "1.2.3",
      scanId: "scan-1",
      scan: { decision: "review", capabilities: { network: true } },
      findings: [{ rule_id: "network-egress", summary: "Outbound request" }],
      dependencies: [],
    }, "security_lead");

    expect(result.model).toBe("sarvam-105b");
    expect(result.brief.headline).toBe("Network behavior needs context");
    expect(JSON.stringify(result)).not.toContain("reasoning_content");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.max_tokens).toBe(900);
    expect(body.reasoning_effort).toBeNull();
    expect(body.extra_body).toBeUndefined();
  });

  it("turns off thinking for v2 reasoning models with structured output", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_REASONING_MODEL = "deepseekv4-flash";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            headline: "Review the release",
            what_changed: [],
            why_it_matters: [],
            verify_next: [],
            uncertainties: [],
            evidence_refs: [],
          }),
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createEvidenceReviewBrief({
      extensionId: "publisher.extension",
      version: "1.2.3",
      scanId: "scan-1",
      scan: { decision: "allow" },
      findings: [],
      dependencies: [],
    }, "engineer");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.extra_body).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("generates only a cited, structured intelligence report", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    process.env.SARVAM_REASONING_MODEL = "sarvam-105b";
    const context = compileEvidenceIntelligenceContext({
      version: "1.2.3",
      scan: { id: "scan-1", extension_id: "publisher.extension", version: "1.2.3", artifact_sha256: "a".repeat(64), analysis_status: "complete", decision: "review", coverage_percent: 100, capabilities: { network: true } },
      findings: [{ id: "finding-1", rule_id: "network-egress", summary: "Outbound request" }],
      files: [],
      dependencies: [],
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            headline: "Review the exact release",
            bottom_line: "The scanner recorded outbound network capability; the deterministic decision remains review.",
            summary_evidence_refs: ["scan.decision", "capability.network.1"],
            claims: [{ claim_id: "claim-1", section: "access_surface", text: "Outbound network requests were recorded.", certainty: "observed", evidence_refs: ["capability.network.1"] }],
            positive_signals: [],
            unknowns: [{ claim_id: "unknown-1", section: "context", text: "The runtime destination is not assessed by this report.", certainty: "unknown", evidence_refs: ["scan.coverage"] }],
            verify_next: [{ text: "Confirm the expected destination with the publisher.", evidence_refs: ["capability.network.1"] }],
          }),
        },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEvidenceIntelligenceReport(context, "security_lead");

    expect(result.model).toBe("sarvam-105b");
    expect(result.report.validation.status).toBe("validated");
    expect(result.report.deterministic.decision_unchanged).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format.json_schema.name).toBe("guardrails_security_intelligence_report");
    expect(body.max_tokens).toBe(2600);
    expect(body.reasoning_effort).toBeNull();
    expect(body.messages[1].content).toContain("BEGIN_UNTRUSTED_EVIDENCE_CONTEXT");
    expect(body.messages[1].content).not.toContain("canonical_report");
  });

  it("collects streamed JSON while discarding reasoning chunks", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    const context = compileEvidenceIntelligenceContext({
      version: "1.2.3",
      scan: { id: "scan-1", extension_id: "publisher.extension", version: "1.2.3", artifact_sha256: "a".repeat(64), analysis_status: "complete", decision: "review", coverage_percent: 100, capabilities: { network: true } },
      findings: [],
      files: [],
      dependencies: [],
    });
    const narrative = {
      headline: "Review the exact release",
      bottom_line: "The deterministic decision remains review for this exact release.",
      summary_evidence_refs: ["scan.decision"],
      claims: [{ claim_id: "claim-1", section: "decision", text: "The report records a review decision.", certainty: "observed", evidence_refs: ["scan.decision"] }],
      positive_signals: [],
      unknowns: [{ claim_id: "unknown-1", section: "context", text: "Runtime exploitability is not established by this report.", certainty: "unknown", evidence_refs: ["scan.coverage"] }],
      verify_next: [{ text: "Confirm the expected network destination before approval.", evidence_refs: ["scan.decision"] }],
    };
    const streamBody = [
      `data: ${JSON.stringify({ model: "sarvam-105b", choices: [{ delta: { reasoning_content: "hidden" } }] })}`,
      `data: ${JSON.stringify({ model: "sarvam-105b", choices: [{ delta: { content: JSON.stringify(narrative) }, finish_reason: "stop" }] })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(streamBody, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEvidenceIntelligenceReport(context, "security_lead");

    expect(result.report.validation.status).toBe("validated");
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).stream).toBe(false);
  });
});
