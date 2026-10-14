import { describe, expect, it } from "vitest";
import { parseScope, validRedirectUri } from "./mcpOAuth";

describe("MCP OAuth request validation", () => {
  it("accepts only the documented read-only scopes", () => {
    expect(parseScope("mcp:read workspace:read")).toEqual(["mcp:read", "workspace:read"]);
    expect(parseScope("workspace:write")).toBeNull();
    expect(parseScope("")).toEqual(["mcp:read"]);
  });

  it("permits HTTPS callbacks and local loopback callbacks only", () => {
    expect(validRedirectUri("https://app.example.com/oauth/callback")).toBe(true);
    expect(validRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(validRedirectUri("http://example.com/callback")).toBe(false);
    expect(validRedirectUri("https://app.example.com/callback#token")).toBe(false);
  });
});
