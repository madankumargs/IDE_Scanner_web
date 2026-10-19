import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync(new URL("./TiltedReportCard.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("./OverviewSection.tsx", import.meta.url), "utf8");

describe("tilted exact-artifact card", () => {
  it("keeps the ReactBits-inspired interaction decorative and evidence-focused", () => {
    expect(card).toContain("Exact artifact identity");
    expect(card).toContain("artifactSha256");
    expect(card).toContain("event.pointerType === \"touch\"");
    expect(overview).toContain("TiltedReportCard");
  });
});
