import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const scannerBuild = String(process.env.SCANNER_BUILD || "").trim().toLowerCase();
const batchLimit = boundedInteger("SCAN_BATCH_LIMIT", 100, 1, 10_000);
const cohortLimit = boundedInteger("COHORT_LIMIT", 250, 1, 10_000);
const requireActiveRelease = String(process.env.REQUIRE_ACTIVE_RELEASE || "").trim().toLowerCase() === "true";
if (!/^[0-9a-f]{40}$/.test(scannerBuild)) {
  throw new Error("SCANNER_BUILD must be a full 40-character scanner commit SHA.");
}

if (requireActiveRelease) {
  const active = queryD1(`
    SELECT id,scanner_build,accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256
    FROM app_scan_publication_releases
    WHERE active=1
    LIMIT 1
  `)[0];
  if (!active
    || String(active.scanner_build || "").toLowerCase() !== scannerBuild
    || !String(active.accuracy_gate_corpus_id || "").trim()
    || !String(active.accuracy_gate_corpus_version || "").trim()
    || !/^[0-9a-f]{64}$/i.test(String(active.accuracy_gate_sha256 || ""))) {
    throw new Error("Bulk scans require an active accuracy-attested Cloudflare release for the requested scanner build.");
  }
}

const rows = queryD1(`
  SELECT extension_id,chunk_index,payload
  FROM registry_product_chunks
  ORDER BY extension_id,chunk_index
`);
const products = new Map();
for (const row of rows) {
  const extensionId = String(row.extension_id || "").trim();
  if (!extensionId) continue;
  const chunks = products.get(extensionId) || [];
  chunks.push(String(row.payload || ""));
  products.set(extensionId, chunks);
}

const candidates = [];
for (const chunks of products.values()) {
  let product;
  try {
    product = JSON.parse(chunks.join(""));
  } catch {
    continue;
  }
  const extension = product?.extension && typeof product.extension === "object" ? product.extension : {};
  const versions = Array.isArray(product?.versions) ? product.versions : [];
  const latest = versions.find((item) => item?.is_latest === true) || versions[0];
  const extensionId = String(extension.id || latest?.extension_id || "").trim();
  const version = String(latest?.version || "").trim();
  if (!extensionId || !version) continue;
  candidates.push({
    extensionId,
    version,
    rank: Number.isFinite(Number(extension.catalog_rank)) ? Number(extension.catalog_rank) : Number.MAX_SAFE_INTEGER,
  });
}

candidates.sort((left, right) => left.rank - right.rank || `${left.extensionId}@${left.version}`.localeCompare(`${right.extensionId}@${right.version}`));
const selected = candidates.slice(0, Math.min(batchLimit, cohortLimit));
if (!selected.length) throw new Error("No catalog candidates were available for the D1 candidate scan.");

const now = new Date().toISOString();
const statements = selected.map((item) => {
  const id = `candidate-${randomUUID()}`;
  const values = [
    id,
    item.extensionId,
    item.version,
    "deep",
    "queued",
    "queued",
    "candidate-publication",
    "public_intelligence",
    scannerBuild,
    now,
    now,
    now,
  ].map(sql);
  return `INSERT INTO app_scan_jobs(id,extension_id,version,profile,status,lifecycle_stage,requester_hash,scan_purpose,expected_scanner_build,created_at,updated_at,last_event_at) SELECT ${values.join(",")} WHERE NOT EXISTS (SELECT 1 FROM app_scan_jobs WHERE extension_id=${sql(item.extensionId)} AND version=${sql(item.version)} AND scan_purpose='public_intelligence' AND expected_scanner_build=${sql(scannerBuild)} AND status IN ('queued','running','complete'));`;
});

const temp = await mkdtemp(join("/tmp", "guardrails-candidate-d1-"));
const sqlPath = join(temp, "queue.sql");
try {
  await writeFile(sqlPath, `${statements.join("\n")}\n`, "utf8");
  execFileSync("npx", ["wrangler", "d1", "execute", "abscissa-registry", "--remote", "--file", sqlPath], { stdio: "inherit" });
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ scanner_build: scannerBuild, require_active_release: requireActiveRelease, selected: selected.length, candidates: selected }, null, 2));

function queryD1(command) {
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", "abscissa-registry", "--remote", "--command", command, "--json"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const payload = JSON.parse(raw);
  return Array.isArray(payload?.[0]?.results) ? payload[0].results : [];
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = String(process.env[name] || "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
