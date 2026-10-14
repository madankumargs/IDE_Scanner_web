import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(
  path.join(process.cwd(), "app/account/page.tsx"),
  "utf8",
);
const css = fs.readFileSync(
  path.join(process.cwd(), "app/account/account.css"),
  "utf8",
);

describe("GuardRails account surface", () => {
  it("keeps authentication behavior while presenting the product outcome", () => {
    expect(page).toContain("/api/auth/google");
    expect(page).toContain("/api/auth/email/request");
    expect(page).toContain("Email me a secure link");
    expect(page).toContain("Know what changed. Keep the decision.");
    expect(page).toContain("Your GuardRails workspace.");
  });

  it("starts onboarding from the extension a user wants to monitor", () => {
    expect(page).toContain("Your first monitored extension");
    expect(page).toContain("Choose an extension to monitor");
    expect(page).toContain("extensionFromDestination");
    expect(page).toContain("selectedExtension.extension_id");
    expect(page).toContain("router.push(safeDestination(destination))");
    expect(page).toContain('params.set("setup", String(teamsBody.id))');
    expect(page).toContain('watchBody.monitoring_state === "monitoring"');
    expect(page).toContain('name: "workspace_created"');
    expect(page).not.toContain('label="Primary IDE"');
    expect(page).not.toContain('label="Your role"');
  });

  it("uses a light atmospheric surface without dark-green treatments", () => {
    expect(css).toContain("#edf7f4");
    expect(css).toContain("#f4faf8");
    expect(css).toContain("#e1f3ef");
    expect(css).not.toContain("#173f2a");
    expect(css).not.toContain("#245d3e");
  });

  it("keeps all new visible text at twelve pixels or larger", () => {
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|10|11)px/);
  });

  it("reserves room for the fixed consent banner so auth controls stay reachable", () => {
    expect(css).toContain("padding: 76px 0 180px !important;");
    expect(css).toContain("padding-bottom: 240px !important;");
  });
});
