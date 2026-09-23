import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const sections = ["metrics", "feed", "inventory", "history", "catalog", "benchmark"];
const output = valueAfter("--out") || "public/registry-snapshot.json";
const registryDatabase = process.env.CLOUDFLARE_REGISTRY_DATABASE || "abscissa-registry";

const active = queryD1(`
  SELECT state.publication_id, publication.generated_at
  FROM registry_publication_state state
  JOIN registry_publications publication ON publication.id = state.publication_id
  WHERE state.state_key = 'active'
  LIMIT 1
`)[0];
if (!active?.publication_id) throw new Error("No active Cloudflare registry publication exists.");

const values = {};
for (const section of sections) {
  const rows = queryD1(`
    SELECT payload
    FROM registry_section_chunks_v2
    WHERE publication_id=${sql(active.publication_id)} AND section=${sql(section)}
    ORDER BY chunk_index
  `);
  values[section] = parseChunks(rows, `registry section ${section}`);
}

const productRows = queryD1(`
  SELECT extension_id,payload
  FROM registry_product_chunks_v2
  WHERE publication_id=${sql(active.publication_id)}
  ORDER BY extension_id,chunk_index
`);
const productChunks = new Map();
for (const row of productRows) {
  const id = String(row.extension_id || "");
  if (!id) continue;
  const chunks = productChunks.get(id) || [];
  chunks.push(String(row.payload || ""));
  productChunks.set(id, chunks);
}
const products = Object.fromEntries([...productChunks.entries()].map(([id, chunks]) => [
  id,
  parseJson(chunks.join(""), `registry product ${id}`),
]));

const snapshot = {
  schema_version: 1,
  generated_at: String(active.generated_at || new Date().toISOString()),
  metrics: values.metrics,
  feed: values.feed,
  inventory: values.inventory,
  history: values.history,
  catalog: values.catalog,
  benchmark: values.benchmark,
  products,
};
validateSnapshot(snapshot);
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output,
  publication_id: String(active.publication_id),
  extensions: Array.isArray(snapshot.catalog) ? snapshot.catalog.length : 0,
  releases: Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items.length : 0,
}, null, 2));

function queryD1(command) {
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", registryDatabase, "--remote", "--command", command, "--json"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const payload = JSON.parse(raw);
  return Array.isArray(payload?.[0]?.results) ? payload[0].results : [];
}

function parseChunks(rows, label) {
  const value = rows.map((row) => String(row.payload || "")).join("");
  return parseJson(value, label);
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateSnapshot(snapshot) {
  const publication = snapshot.inventory?.publication;
  if (!publication || !String(publication.release_id || "") || !String(publication.policy_version || "")
    || !String(publication.ruleset_version || "") || !String(publication.score_schema_version || "")
    || !/^[0-9a-f]{40}$/i.test(String(publication.scanner_build || ""))
    || !String(publication.accuracy_gate_corpus_id || "") || !String(publication.accuracy_gate_corpus_version || "")
    || !/^[0-9a-f]{64}$/i.test(String(publication.accuracy_gate_sha256 || ""))) {
    throw new Error("Active Cloudflare registry publication is missing its accuracy-attested identity.");
  }
  if (!Array.isArray(snapshot.inventory?.items) || !snapshot.inventory.items.length) {
    throw new Error("Active Cloudflare registry publication contains no inventory items.");
  }
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function valueAfter(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : "";
}
