import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanArtifactSource } from "./runScan";

function response(body: unknown, init?: ResponseInit) { return new Response((body instanceof Uint8Array || typeof body === "string" ? body : JSON.stringify(body)) as BodyInit, init); }
function npmTarball(path: string, content: string) {
  const header = Buffer.alloc(512); header.write(`package/${path}`, 0, "utf8"); header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124, "ascii"); header.write("0000644\0", 100, "ascii");
  const body = Buffer.from(content); const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512); body.copy(padded); return gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024)]));
}

afterEach(() => vi.restoreAllMocks());
describe("scanArtifactSource", () => {
  it("fetches a GitHub source and returns the analyzeArtifact contract", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/repos/acme/tool") && !url.includes("contents")) return response({ default_branch: "trunk" });
      if (url.includes("contents")) return response([{ type: "file", path: "SKILL.md", download_url: "https://raw.test/skill" }]);
      return response("---\ndescription: Formats text.\n---\nUse the formatter.");
    });
    const result = await scanArtifactSource({ source: "github", owner: "acme", repo: "tool" }, "skill");
    expect(result).toMatchObject({ analysis_status: "complete", decision: "allow", scannedFiles: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetches an npm tarball without installing or executing it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(npmTarball("package.json", '{"name":"safe"}'), { headers: { "content-type": "application/gzip" } }));
    const result = await scanArtifactSource({ source: "npm", packageName: "safe-server", version: "1.0.0" }, "mcp");
    expect(result).toMatchObject({ analysis_status: "complete", decision: "allow", scannedFiles: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
