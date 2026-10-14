import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GuardRails MCP server card", () => {
  it("publishes the canonical read-only remote descriptor", async () => {
    const response = GET();
    const card = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(card).toMatchObject({
      name: "dev.abscissa/guardrails",
      version: "1.3.0",
      remotes: [{ type: "streamable-http", url: "https://abscissa.dev/api/mcp" }],
    });
  });
});
