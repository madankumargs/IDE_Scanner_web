import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const report = readFileSync(new URL("./EvidenceIntelligenceReport.tsx", import.meta.url), "utf8");
const visuals = readFileSync(new URL("./EvidenceIntelligenceVisuals.tsx", import.meta.url), "utf8");

describe("reviewer guide surface", () => {
  it("keeps the first screen centered on one user decision", () => {
    expect(report).toContain("What you need to know");
    expect(report).toContain("What you should do next");
    expect(report).toContain("What remains unknown");
    expect(report).not.toContain("What the evidence shows");
    expect(report).not.toContain("Why a reviewer should care");
    expect(report).not.toContain("Positive signals");
  });

  it("renders provider output through the structured guide and deterministic fallback", () => {
    expect(report).toContain("deterministic_fallback");
    expect(report).toContain("Deterministic review summary — AI interpretation unavailable");
    expect(report).toContain("EvidenceRefs");
    expect(report).toContain("certainty");
    expect(visuals).toContain("ReviewerEventChainVisual");
    expect(visuals).toContain("Validated evidence-backed event chain");
  });
});
