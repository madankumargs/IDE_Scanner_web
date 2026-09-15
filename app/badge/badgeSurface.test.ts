import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const builder = readFileSync(new URL("./BadgeBuilder.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../api/badge/route.ts", import.meta.url), "utf8");
const productData = readFileSync(new URL("../../lib/productData.ts", import.meta.url), "utf8");

describe("publisher badge workflow", () => {
  it("requires an authenticated scored Deep Scan before generating snippets", () => {
    expect(builder).toContain("browserAuthHeaders");
    expect(builder).toContain('fetch("/api/deep-scans"');
    expect(builder).toContain("Sign in to scan this extension");
    expect(builder).toContain("Risk score:");
    expect(builder).toContain("version=${encodeURIComponent(scan.version)}");
  });

  it("keeps the public badge endpoint version-pinned and score-aware", () => {
    expect(route).toContain("decision.risk_score");
    expect(route).toContain("version");
    expect(productData).toContain("getCloudflareRegistryCatalogExtension");
    expect(productData).toContain("catalogFallback?.latest_version");
  });
});
