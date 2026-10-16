import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("GuardRails and vsix-audit comparison", () => {
  it("keeps local VSIX inspection and release-governance roles distinct", () => {
    expect(page).toContain("Use vsix-audit for a local VSIX");
    expect(page).toContain("Use GuardRails for release evidence");
    expect(page).toContain("Use GuardRails after the first scan");
    expect(page).toContain("They can be used together.");
  });

  it("does not turn either scan result into a universal safety claim", () => {
    expect(page).toContain("A scan lowers uncertainty. It does not erase it.");
    expect(page).toContain("not proof");
  });
});
