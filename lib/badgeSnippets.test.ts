import { describe, expect, it } from "vitest";
import { badgeHtml, badgeMarkdown } from "./badgeSnippets";

describe("shared badge snippets", () => {
  it("keeps public and workspace embeds identical", () => {
    expect(badgeMarkdown("/badge.svg", "/report")).toBe("[![GuardRails analysis](/badge.svg)](/report)");
    expect(badgeHtml("/badge.svg", "/report")).toContain('alt="Analyzed by GuardRails"');
  });
});
