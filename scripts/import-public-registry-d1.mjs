import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sections = ["metrics", "feed", "inventory", "history", "catalog", "benchmark"];
const chunkSize = 80_000;
const BUILD_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function chunks(value) {
  const text = JSON.stringify(value);
  const result = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    result.push(text.slice(index, index + chunkSize));
  }
  return result.length ? result : ["null"];
}

export function validateRegistrySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.schema_version !== 1) {
    throw new Error("Public registry snapshot must use schema_version 1.");
  }
  const publication = snapshot.inventory && typeof snapshot.inventory === "object" && !Array.isArray(snapshot.inventory)
    ? snapshot.inventory.publication
    : null;
  if (!publication || typeof publication !== "object" || Array.isArray(publication)
    || !String(publication.release_id || "")
    || !String(publication.policy_version || "")
    || !String(publication.ruleset_version || "")
    || !String(publication.score_schema_version || "")
    || !BUILD_PATTERN.test(String(publication.scanner_build || ""))
    || !String(publication.accuracy_gate_corpus_id || "")
    || !String(publication.accuracy_gate_corpus_version || "")
    || !SHA256_PATTERN.test(String(publication.accuracy_gate_sha256 || ""))) {
    throw new Error("Public registry snapshot is missing its accuracy-attested publication identity.");
  }
  const items = Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items : [];
  if (!items.length) throw new Error("Public registry snapshot contains no complete publication items.");
  for (const item of items) {
    if (!item || !["allow", "review", "block"].includes(String(item.decision || ""))
      || String(item.scanner_build || "").toLowerCase() !== String(publication.scanner_build).toLowerCase()
      || String(item.ruleset_version || "") !== String(publication.ruleset_version || "")
      || Number(item.coverage_percent) !== 100
      || !SHA256_PATTERN.test(String(item.artifact_sha256 || ""))) {
      throw new Error("Public registry snapshot contains an item without complete attested coverage.");
    }
  }
  return snapshot;
}

export function buildRegistryImportSql(snapshot, {
  generatedAt = String(snapshot.generated_at || new Date().toISOString()),
  createdAt = new Date().toISOString(),
  publicationId,
} = {}) {
  validateRegistrySnapshot(snapshot);
  const snapshotDigest = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const id = publicationId || `registry-${Date.now()}-${snapshotDigest.slice(0, 16)}`;
  const statements = [
    `INSERT INTO registry_publications (id, generated_at, created_at) VALUES (${sql(id)}, ${sql(generatedAt)}, ${sql(createdAt)});`,
  ];

  for (const section of sections) {
    chunks(snapshot[section]).forEach((payload, chunkIndex) => {
      statements.push(
        `INSERT INTO registry_section_chunks_v2 (publication_id, section, chunk_index, generated_at, payload) VALUES (${sql(id)}, ${sql(section)}, ${chunkIndex}, ${sql(generatedAt)}, ${sql(payload)});`,
      );
    });
  }

  for (const [extensionId, product] of Object.entries(snapshot.products || {})) {
    chunks(product).forEach((payload, chunkIndex) => {
      statements.push(
        `INSERT INTO registry_product_chunks_v2 (publication_id, extension_id, chunk_index, generated_at, payload) VALUES (${sql(id)}, ${sql(extensionId)}, ${chunkIndex}, ${sql(generatedAt)}, ${sql(payload)});`,
      );
    });
  }

  // The pointer is intentionally the first write that can change what readers
  // see. If D1 execution stops before this point, the previous publication
  // remains active and complete. Cleanup is best-effort and happens only after
  // the new generation is visible.
  statements.push(
    `INSERT OR REPLACE INTO registry_publication_state (state_key, publication_id, updated_at) VALUES ('active', ${sql(id)}, ${sql(createdAt)});`,
    `DELETE FROM registry_section_chunks_v2 WHERE publication_id IN (SELECT id FROM registry_publications WHERE id <> ${sql(id)} AND id <> (SELECT publication_id FROM registry_publication_state WHERE state_key = 'active'));`,
    `DELETE FROM registry_product_chunks_v2 WHERE publication_id IN (SELECT id FROM registry_publications WHERE id <> ${sql(id)} AND id <> (SELECT publication_id FROM registry_publication_state WHERE state_key = 'active'));`,
    `DELETE FROM registry_publications WHERE id <> ${sql(id)} AND id <> (SELECT publication_id FROM registry_publication_state WHERE state_key = 'active');`,
  );
  return { statements, publicationId: id, snapshotDigest, generatedAt };
}

function main() {
  const [, , snapshotPath = "public/registry-snapshot.json", outputPath = ".tmp/public-registry-d1.sql"] = process.argv;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const built = buildRegistryImportSql(snapshot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${built.statements.join("\n")}\n`);
  console.log(JSON.stringify({ snapshotPath, outputPath, generatedAt: built.generatedAt, publicationId: built.publicationId, snapshotSha256: built.snapshotDigest, statements: built.statements.length, bytes: fs.statSync(outputPath).size }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
