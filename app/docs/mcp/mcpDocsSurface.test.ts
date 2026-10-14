import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("public MCP discovery documentation", () => {
  it("publishes the stable endpoint, client workflows, and evidence boundary", () => {
    const page = read("./page.tsx");
    expect(page).toContain("https://abscissa.dev/api/mcp");
    expect(page).toContain("codex mcp add guardrails");
    expect(page).toContain("claude mcp add --transport http guardrails");
    expect(page).toContain("check_extension_risk");
    expect(page).toContain("find_reputable_alternatives");
    expect(page).toContain("unreviewed");
    expect(page).toContain("application/ld+json");
  });

  it("makes the page discoverable from site navigation and the sitemap", () => {
    expect(read("../../SiteNav.tsx")).toContain('"/docs/mcp"');
    expect(read("../../sitemap.ts")).toContain('"/docs/mcp"');
    expect(read("../../layout.tsx")).toContain('href="/docs/mcp"');
  });
});
