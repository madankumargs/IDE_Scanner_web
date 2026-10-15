import { afterEach, describe, expect, it, vi } from "vitest";
import { deepScanSupportError, isConcreteVersion, listMarketplaceVersions, listPublisherExtensions, searchMarketplace } from "@/lib/marketplace";

describe("listMarketplaceVersions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deduplicates target-platform entries for the same Marketplace version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ extensions: [{ versions: [
        { version: "2.1.218", lastUpdated: "first" },
        { version: "2.1.218", lastUpdated: "duplicate-platform" },
        { version: "2.1.217", lastUpdated: "older" },
      ] }] }] }),
    }));

    const versions = await listMarketplaceVersions("Anthropic.claude-code");
    expect(versions.map((item) => item.version)).toEqual(["2.1.218", "2.1.217"]);
    expect(versions.filter((item) => item.is_latest)).toHaveLength(1);
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.flags).toBe(1);
  });

  it("rejects registry channel aliases as exact versions", () => {
    expect(isConcreteVersion("latest")).toBe(false);
    expect(isConcreteVersion("2.1.218")).toBe(true);
  });

  it("returns an exact Marketplace identity without waiting for Open VSX", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("marketplace.visualstudio.com");
      return {
        ok: true,
        json: async () => ({ results: [{ extensions: [{
          extensionName: "copilot", displayName: "GitHub Copilot", publisher: { publisherName: "GitHub" }, versions: [{ version: "1.0.0" }],
        }] }] }),
      };
    });
    vi.stubGlobal("fetch", fetch);

    await expect(searchMarketplace("GitHub.copilot")).resolves.toMatchObject([{ extension_id: "GitHub.copilot" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("only marks publishers verified when the Marketplace confirms domain verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ extensions: [{
        extensionName: "assistant",
        displayName: "Assistant",
        publisher: {
          publisherName: "Example",
          isDomainVerified: false,
          flags: "verified",
        },
        versions: [{ version: "1.0.0" }],
      }] }] }),
    }));

    const [item] = await searchMarketplace("Example.assistant");
    expect(item.publisher_verified).toBe(false);
  });

  it("combines Marketplace and Open VSX search results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("open-vsx.org")) {
        return {
          ok: true,
          json: async () => ({
            extensions: [{
              namespace: "eclipse",
              name: "assistant",
              displayName: "Open VSX Assistant",
              version: "2.0.0",
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ results: [{ extensions: [{
          extensionName: "assistant",
          displayName: "Marketplace Assistant",
          publisher: { publisherName: "Example" },
          versions: [{ version: "1.0.0" }],
        }] }] }),
      };
    }));

    const results = await searchMarketplace("assistant");
    expect(results.map((item) => item.extension_id)).toEqual(
      expect.arrayContaining(["Example.assistant", "eclipse.assistant"]),
    );
  });

  it("supports Visual Studio VSIX packages for Deep Scan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ extensions: [{
        extensionName: "qodogen",
        displayName: "Qodo - AI Code Review",
        publisher: { publisherName: "Codium" },
        versions: [{ version: "0.14.2", files: [{ assetType: "QodoGenVS.vsix" }] }],
      }] }] }),
    }));

    const [item] = await searchMarketplace("Codium.qodogen");
    expect(item.scan_supported).toBe(true);
    expect(deepScanSupportError(item)).toBeNull();
  });

  it("keeps packages without a scan artifact unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ extensions: [{
        extensionName: "docs-only",
        displayName: "Docs only",
        publisher: { publisherName: "Example" },
        versions: [{ version: "1.0.0", files: [{ assetType: "Microsoft.VisualStudio.Services.Content.Details" }] }],
      }] }] }),
    }));

    const [item] = await searchMarketplace("Example.docs-only");
    expect(item.scan_supported).toBe(false);
    expect(deepScanSupportError(item)).toContain("Visual Studio VSIX package");
  });

  it("lists and ranks only extensions from the exact publisher", async () => {
    const extension = (publisher: string, name: string, installs: number) => ({
      extensionName: name,
      displayName: name,
      publisher: { publisherName: publisher, displayName: publisher, isDomainVerified: true },
      versions: [{ version: "1.0.0" }],
      statistics: [{ statisticName: "install", value: installs }],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ extensions: [extension("GitHub", "second", 20), extension("Other", "noise", 999), extension("GitHub", "first", 50)] }] }),
    }));
    const results = await listPublisherExtensions("GitHub");
    expect(results.map((item) => item.extension_id)).toEqual(["GitHub.first", "GitHub.second"]);
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.filters[0].criteria).toEqual([{ filterType: 18, value: "GitHub" }]);
  });
});
