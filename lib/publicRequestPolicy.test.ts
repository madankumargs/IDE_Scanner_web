import { describe, expect, it } from "vitest";
import { isPublicRoutePath, isRscPrefetch } from "./publicRequestPolicy";

describe("public request policy", () => {
  it("keeps public pages cache-eligible while excluding private scan reports", () => {
    expect(isPublicRoutePath("/")).toBe(true);
    expect(isPublicRoutePath("/extensions/GitHub.copilot")).toBe(true);
    expect(isPublicRoutePath("/extensions/GitHub.copilot/versions/1.0.0")).toBe(true);
    expect(isPublicRoutePath("/extensions/GitHub.copilot/versions/1.0.0/scans/scan-1")).toBe(false);
    expect(isPublicRoutePath("/workspace")).toBe(false);
  });

  it("recognizes non-API Next prefetches without changing authorization", () => {
    const request = new Request("https://abscissa.dev/?_rsc=flight", {
      headers: {
        RSC: "1",
        "Next-Router-Prefetch": "1",
      },
    });
    expect(isRscPrefetch(request)).toBe(true);
    expect(
      isRscPrefetch(
        new Request("https://abscissa.dev/workspace?_rsc=flight", {
          headers: { RSC: "1", "Next-Router-Prefetch": "1" },
        }),
      ),
    ).toBe(true);
    expect(
      isRscPrefetch(
        new Request("https://abscissa.dev/?_rsc=flight", {
          headers: { RSC: "1", Authorization: "Bearer token" },
        }),
      ),
    ).toBe(false);
    expect(
      isRscPrefetch(
        new Request("https://abscissa.dev/api/auth/session?_rsc=flight", {
          headers: { RSC: "1", "Next-Router-Prefetch": "1" },
        }),
      ),
    ).toBe(false);
  });
});
