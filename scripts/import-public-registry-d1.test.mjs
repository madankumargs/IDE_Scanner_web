import { describe, expect, it } from "vitest";
import { buildRegistryImportSql, splitSqlStatements, validateRegistrySnapshot } from "./import-public-registry-d1.mjs";

function snapshot() {
  return {
    schema_version: 1,
    generated_at: "2026-09-19T00:00:00.000Z",
    metrics: { indexed_extensions: 1 },
    feed: [],
    inventory: {
      publication: {
        release_id: "release-1",
        policy_version: "policy-1",
        ruleset_version: "rules-1",
        score_schema_version: "2",
        scanner_build: "a".repeat(40),
        accuracy_gate_corpus_id: "corpus-1",
        accuracy_gate_corpus_version: "1",
        accuracy_gate_sha256: "b".repeat(64),
      },
      items: [{
        extension_id: "publisher.extension",
        version: "1.0.0",
        decision: "allow",
        scanner_build: "a".repeat(40),
        ruleset_version: "rules-1",
        coverage_percent: 100,
        artifact_sha256: "c".repeat(64),
      }],
    },
    history: [],
    catalog: [],
    benchmark: { rows: [] },
    products: { "publisher.extension": { extension: { id: "publisher.extension" } } },
  };
}

describe("atomic D1 registry import", () => {
  it("stages every chunk and flips one active publication pointer last", () => {
    const built = buildRegistryImportSql(snapshot(), { createdAt: "2026-09-19T00:00:01.000Z", publicationId: "registry-test-publication" });
    const sql = built.statements.join("\n");
    const pointer = sql.indexOf("INSERT OR REPLACE INTO registry_publication_state");
    expect(pointer).toBeGreaterThan(0);
    expect(sql).toContain("INSERT INTO registry_publications");
    expect(sql).toContain("registry_section_chunks_v2");
    expect(sql).toContain("registry_product_chunks_v2");
    expect(sql).toContain("VALUES ('registry-test-publication', 'publisher.extension', 0");
    expect(sql).toContain("state_key = 'active'");
    expect(sql.indexOf("registry_section_chunks_v2")).toBeLessThan(pointer);
    expect(sql.indexOf("registry_product_chunks_v2")).toBeLessThan(pointer);
    expect(sql).not.toContain("DELETE FROM registry_section_chunks;");
    expect(sql).not.toContain("DELETE FROM registry_product_chunks;");
  });

  it("rejects a mirror without an accuracy-attested complete publication", () => {
    const invalid = snapshot();
    delete invalid.inventory.publication.accuracy_gate_sha256;
    expect(() => validateRegistrySnapshot(invalid)).toThrow("accuracy-attested publication identity");
  });

  it("can split a publication without moving the active pointer before the final part", () => {
    const built = buildRegistryImportSql(snapshot(), { publicationId: "registry-split-publication" });
    const parts = splitSqlStatements(built.statements, 1_000_000);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.flat().join("\n")).toBe(built.statements.join("\n"));
    const pointer = parts.flat().findIndex((statement) => statement.includes("INSERT OR REPLACE INTO registry_publication_state"));
    const lastPart = parts.at(-1);
    expect(pointer).toBeGreaterThanOrEqual(0);
    expect(lastPart?.some((statement) => statement.includes("INSERT OR REPLACE INTO registry_publication_state"))).toBe(true);
  });
});
