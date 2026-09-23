import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeArtifact } from "./runScan";
import { deriveTrustTier } from "../trustTiers";
const root = join(process.cwd(), "test", "fixtures", "artifact-scan");
function scan(dir: string, file: string) { return analyzeArtifact([{ path: file, name: file, content: readFileSync(join(root, dir, file), "utf8") }], { kind: file.includes("SKILL") ? "skill" : file.includes("mcp") ? "mcp" : "unknown", source: "github" }); }
describe("artifact scanner evaluation fixtures", () => {
  it("blocks every malicious fixture", () => { for (const file of readdirSync(join(root, "malicious"))) expect(scan("malicious", file).decision, file).toBe("block"); });
  it("allows ordinary fixtures without high or critical findings", () => { for (const file of readdirSync(join(root, "benign"))) { const result = scan("benign", file); expect(result.decision, file).toBe("allow"); expect(result.findings.some(f => f.severity === "critical" || f.severity === "high"), file).toBe(false); } });
  it("flags broad skill scope for review and satisfies the trust contract", () => { const result = scan("review", "skill-broad-tool-scope.SKILL.md"); expect(result.decision).toBe("review"); expect(deriveTrustTier(result)).toMatchObject({ tier: "attention" }); });
});
