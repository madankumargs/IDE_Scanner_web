import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(new URL("../TeamWorkspace.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("./views/BadgeStudioView.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./badgeStudio.module.css", import.meta.url), "utf8");

describe("team badge studio surface", () => {
  it("makes badge creation a first-class authenticated workspace destination", () => {
    expect(workspace).toContain('"badges"');
    expect(workspace).toContain("BadgeStudioView");
    expect(workspace).toContain("badgeItems");
    expect(studio).toContain("/badges");
    expect(studio).toContain("getAuthHeaders");
    expect(studio).toContain("Scan latest release");
  });

  it("explains exact-release trust and gives teams a useful return action", () => {
    for (const copy of [
      "Exact-release badges",
      "Release changed",
      "Copy Markdown",
      "Open exact report",
      "Scan the watched release",
      "Badge health",
      "Publish badge",
      "Private badge",
      "team_badge_report_opened",
      "team_badge_refresh_intent",
    ]) {
      expect(studio).toContain(copy);
    }
    expect(css).toContain("@media");
    expect(css).toContain("badgeCard");
  });
});
