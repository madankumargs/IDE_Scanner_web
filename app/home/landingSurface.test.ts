import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const page = () => read("../page.tsx");
const landing = () => read("./AuthorityLanding.tsx");

describe("GuardRails landing surface", () => {
  it("composes the homepage from focused product sections", () => {
    expect(page()).toContain("<AuthorityLanding />");
    expect(landing()).toContain("<ReleaseReviewFilm />");
    expect(landing()).toContain("<DecisionMemoryFilm />");
    expect(landing()).toContain("<IdeCompatibility />");
    expect(landing()).not.toContain("<SecurityBento />");
    expect(landing()).not.toContain("<ReleaseWorkflow />");
  });

  it("uses official local editor marks without decorative stand-ins", () => {
    const compatibility = read("./IdeCompatibility.tsx");
    expect(compatibility).toContain('src: "/brands/ide/vscode.svg"');
    expect(compatibility).toContain('src: "/brands/ide/cursor.svg"');
    expect(compatibility).toContain('src: "/brands/ide/windsurf.svg"');
    expect(compatibility).toContain('src: "/brands/ide/vscodium.svg"');
    expect(compatibility).toContain("No endorsement implied");
    expect(compatibility).not.toContain("Code2");
    expect(compatibility).not.toContain("MousePointer2");
  });

  it("keeps the focused homepage surfaces free of gradients and fake cursor motion", () => {
    const focusedStyles = [
      read("./authorityLanding.module.css"),
      read("./releaseReviewFilm.module.css"),
      read("./decisionMemoryFilm.module.css"),
      read("./ideCompatibility.module.css"),
    ].join("\n");
    expect(focusedStyles).not.toContain("gradient");
    expect(focusedStyles).not.toMatch(/@keyframes\s+cursor/i);
    expect(focusedStyles).not.toMatch(/\.cursor\b/i);
  });

  it("removes closed navigation popovers from layout", () => {
    expect(read("../authority.css")).toContain(".navPopover:not(.isOpen)");
    expect(read("../authority.css")).toContain("display: none");
  });
  it("attaches decisions durably to an exact release", () => {
    expect(landing()).toContain("DecisionMemoryFilm");
    const memory = read("./DecisionMemoryFilm.tsx");
    expect(memory).toContain("Approved with context");
    expect(memory).toContain("Decision saved for this release");
    expect(memory).toContain("brings forward the last decision");
  });

  it("keeps marketplace proof points visible", () => {
    const proof = read("./MarketplaceProof.tsx");
    expect(proof).toContain('value: "~60,000"');
    expect(proof).toContain('value: "~1,800"');
    expect(proof).toContain('value: "3.3B"');
    // The block is labelled "Public industry figures", so every tile must be
    // checkable against a cited source. The self-reported "4x detection
    // growth" number had none and was removed rather than relabelled.
    expect(proof).not.toContain('value: "4×"');
  });

  it("explains the Sarvam relationship without overstating the product claim", () => {
    expect(landing()).toContain("SarvamProgramNote");
    const note = read("../SarvamProgramNote.tsx");
    expect(note).toContain("AI-assisted reviewer guide");
    expect(note).toContain("Plain-language scan summaries");
    expect(note).toContain("what should I do next?");
  });

  it("leads new visitors to public working surfaces while exposing the team path", () => {
    expect(landing()).toContain('href="/registry"');
    expect(landing()).toContain('href="/workspace"');
    expect(landing()).toContain("Open the team workspace");
  });

  it("shows the release change interaction on the landing page", () => {
    expect(landing()).toContain("ReleaseReviewFilm");
    const film = read("./ReleaseReviewFilm.tsx");
    expect(film).toContain("NEW CAPABILITY");
    expect(film).toContain("What changed");
    expect(film).toContain("Save decision");
    expect(film).toContain('from "motion/react"');
    expect(film).not.toContain("setInterval");
  });

  it("keeps the decision-memory interaction visitor-led", () => {
    const memory = read("./DecisionMemoryFilm.tsx");
    expect(memory).toContain('from "motion/react"');
    expect(memory).toContain('aria-pressed={nextRelease}');
    expect(memory).not.toContain("setInterval");
  });
});
