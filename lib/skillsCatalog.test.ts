import { describe, expect, it } from "vitest";
import { expandSkillSearchQuery, normalizePublicSkill } from "./skillsCatalog";

describe("public Skills catalog", () => {
  it("normalizes public index results into source-aware cards", () => {
    expect(normalizePublicSkill({ id: "owner/repo/demo", source: "owner/repo", skillId: "demo", name: "Demo", installs: 12 })).toMatchObject({
      id: "owner/repo/demo",
      sourceType: "github",
      githubUrl: "https://github.com/owner/repo",
      installs: 12,
    });
  });

  it("handles the common Andrej Karpathy voice-search variant", () => {
    expect(expandSkillSearchQuery("Andreti Karappati")).toBe("karpathy");
    expect(expandSkillSearchQuery("React Native")).toBe("React Native");
  });

  it("does not present non-GitHub sources as GitHub repositories", () => {
    expect(normalizePublicSkill({ id: "smithery.ai/karpathy-guidelines", source: "smithery.ai", name: "Karpathy guidelines", installs: 3 })).toMatchObject({
      sourceType: "unknown",
      githubUrl: null,
      installUrl: null,
    });
  });
});
