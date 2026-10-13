import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
describe("pricing and solution surfaces", () => {
  it("keeps scanning free and anchors real plan prices without enabling purchase", () => {
    const pricing = read("./pricing/page.tsx");
    expect(pricing).toContain('price: "$0"');
    expect(pricing).toContain('price: "$19"');
    expect(pricing).toContain('price: "$99"');
    expect(pricing).not.toContain('price: "Free"');
    expect(pricing).toContain("Early access · billing not yet open");
    expect(pricing.toLowerCase()).toContain("no payment is possible yet");
    expect(pricing).not.toContain("mailto:");
  });
  it("defines the four role-specific solution journeys", () => {
    const data = read("./solutions/data.ts");
    for (const phrase of [
      "For developers",
      "For engineering teams",
      "For security teams",
      "For AI-agent security",
    ])
      expect(data).toContain(phrase);
  });
  it("renders marketing and trust surfaces in one accent hue", () => {
    const css = read("./marketing.module.css");
    const trust = read("./trust.module.css");
    // The accent is the brand green, referenced through the token so the
    // cascade cannot fork it back into a second hue.
    expect(css).toContain("var(--ledger-signal)");
    expect(trust).toContain("var(--ledger-signal)");
    // Retired palettes: dominant blue, plum, and the earlier violet accent pass.
    for (const hex of ["#2f6fdd", "#9a496d", "#7658d8", "#f17e69", "#e4d8ff"]) {
      expect(css.toLowerCase()).not.toContain(hex);
      expect(trust.toLowerCase()).not.toContain(hex);
    }
  });
});
