import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/skills/page.tsx"), "utf8");
const catalog = fs.readFileSync(path.join(root, "app/skills/SkillsCatalogClient.tsx"), "utf8");
const client = fs.readFileSync(path.join(root, "app/skills/SkillsScanClient.tsx"), "utf8");
const reportClient = fs.readFileSync(path.join(root, "app/skills/SkillsFullReportClient.tsx"), "utf8");
const reportPage = fs.readFileSync(path.join(root, "app/skills/report/page.tsx"), "utf8");
const storage = fs.readFileSync(path.join(root, "app/skills/skillsReportStorage.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/skills/scan/route.ts"), "utf8");
const catalogRoute = fs.readFileSync(path.join(root, "app/api/skills/catalog/route.ts"), "utf8");

describe("Skills scanning product surface", () => {
  it("keeps source scanning on its own page and API boundary", () => {
    expect(page).toContain("SkillsScanClient");
    expect(page).toContain("SkillsCatalogClient");
    expect(page).toContain("separate from Extension Registry analysis");
    expect(catalog).toContain("/api/skills/catalog");
    expect(catalog).toContain("Public Skills directory");
    expect(catalog).toContain("safety verdict");
    expect(catalogRoute).toContain("recommendedPublicSkills");
    expect(catalogRoute).toContain("searchPublicSkills");
    expect(client).toContain("/api/skills/scan");
    expect(client).toContain("no scripts or install hooks executed");
    expect(client).toContain("What did GuardRails decide?");
    expect(client).toContain("Why did it decide that?");
    expect(client).toContain("What should I do next?");
    expect(client).toContain("/skills/report");
    expect(storage).toContain("guardrails.skills.report.v1");
    expect(reportPage).toContain("SkillsFullReportClient");
    expect(reportClient).toContain("/api/auth/session");
    expect(reportClient).toContain("Technical evidence is available after sign-in.");
    expect(reportClient).toContain("Evidence ledger");
    expect(route).toContain("scanPublicGitHubSkill");
    expect(route).toContain("public GitHub Skill URL");
  });
});
