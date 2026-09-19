import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(
  new URL("./research.module.css", import.meta.url),
  "utf8",
);

describe("research index surface", () => {
  it("states the editorial evidence boundary", () => {
    expect(page).toContain("decisions you can defend");
    expect(page).toContain("Exact artifact before reputation");
    expect(page).toContain("Evidence before interpretation");
    expect(page).toContain("Limitations beside every conclusion");
  });

  it("links research to reproducible benchmark evidence", () => {
    expect(page).toContain('href="/benchmark"');
    expect(page).toContain("No latest-version substitutions");
    expect(page).toContain('href="/registry"');
  });

  it("publishes the Solidity Pro case study as an attributed research note", () => {
    const research = readFileSync(new URL("../../lib/research.ts", import.meta.url), "utf8");
    expect(research).toContain('slug: "solidity-pro"');
    expect(research).toContain("wallet stealer behind the audit tool");
    expect(research).toContain("Yeeth Security");
  });

  it("publishes the exact-artifact BCAI case without claiming first discovery", () => {
    const research = readFileSync(new URL("../../lib/research.ts", import.meta.url), "utf8");
    expect(research).toContain('slug: "bcai-rosetta-exact-artifact"');
    expect(research).toContain("b1b9785cdc7be479061f121f282391fba9be013d896d9a54f395621634709216");
    expect(research).toContain("does not claim GuardRails discovered the campaign first");
  });

  it("publishes the exact-release Nx Console case without generalizing by publisher", () => {
    const research = readFileSync(new URL("../../lib/research.ts", import.meta.url), "utf8");
    expect(research).toContain('slug: "nx-console-18-95-0"');
    expect(research).toContain("1a4afce34918bdc74ae3f31edaffffaa0ee074d83618f53edfd88137927340b8");
    expect(research).toContain("not an original discovery claim");
  });

  it("publishes the exact-hash Code Runner vulnerability boundary", () => {
    const research = readFileSync(new URL("../../lib/research.ts", import.meta.url), "utf8");
    expect(research).toContain('slug: "code-runner-cve-2025-65715"');
    expect(research).toContain("4c8e4aea7dd07c9c20173e71869759fb2ce2f55b9819c4b374172467af03b144");
    expect(research).toContain("not a GuardRails discovery claim");
  });

  it("uses a light responsive and motion-safe surface", () => {
    expect(styles).toContain("#edf7f4");
    expect(styles).toContain("#f4faf8");
    expect(styles).toContain("prefers-reduced-motion");
  });
});
