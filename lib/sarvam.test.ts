import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReviewEvidence,
  createEvidenceReviewBrief,
  parseEvidenceReviewBrief,
  selectedSarvamModel,
  SarvamConfigurationError,
  SarvamOutputError,
} from "@/lib/sarvam";

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
});
