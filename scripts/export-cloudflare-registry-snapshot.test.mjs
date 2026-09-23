import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./export-cloudflare-registry-snapshot.mjs", import.meta.url), "utf8");

describe("Cloudflare registry snapshot export", () => {
  it("reads only the active immutable registry publication", () => {
    expect(source).toContain("registry_publication_state");
    expect(source).toContain("registry_section_chunks_v2");
    expect(source).toContain("registry_product_chunks_v2");
    expect(source).toContain("state.state_key = 'active'");
  });

  it("keeps the accuracy-attested publication boundary", () => {
    expect(source).toContain("accuracy_gate_corpus_id");
    expect(source).toContain("accuracy_gate_corpus_version");
    expect(source).toContain("accuracy_gate_sha256");
    expect(source).toContain("Active Cloudflare registry publication is missing its accuracy-attested identity.");
  });
});
