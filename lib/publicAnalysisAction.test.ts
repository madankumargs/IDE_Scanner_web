import { describe, expect, it } from "vitest";
import { publicAnalysisAction } from "@/lib/publicAnalysisAction";

describe("public analysis action", () => {
  const input = {
    extensionId: "mhutchie.git-graph",
    version: "1.30.0",
    fullAnalysisHref: "/extensions/mhutchie.git-graph/versions/1.30.0/scans/scan-1",
    scanned: true,
  };

  it("takes a signed-in user directly to the full report", () => {
    expect(publicAnalysisAction({ ...input, signedIn: true })).toEqual({
      href: input.fullAnalysisHref,
      label: "Open full report and monitoring",
      requiresSignIn: false,
    });
  });

  it("preserves the sign-in handoff for a signed-out user", () => {
    expect(publicAnalysisAction({ ...input, signedIn: false })).toEqual({
      href: "/account?next=%2Fextensions%2Fmhutchie.git-graph%2Fversions%2F1.30.0%2Fscans%2Fscan-1",
      label: "Sign in for full report and monitoring",
      requiresSignIn: true,
    });
  });
});
