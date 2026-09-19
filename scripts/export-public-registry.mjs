import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { benchmarkRows } from "../lib/websiteBenchmarkRows.ts";

const output = resolve("public/registry-snapshot.json");

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = String(process.env.SUPABASE_PASSWORD || "").trim();
  if (!password) throw new Error("DATABASE_URL or SUPABASE_PASSWORD is required for the public registry export.");
  return `postgresql://postgres.kmdujtabqaxgoeltbxpq:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require`;
}

const client = new Client({ connectionString: connectionString() });
await client.connect();

try {
  const generatedAt = new Date().toISOString();
  const releaseResult = await client.query(`
    select id, policy_version, ruleset_version, score_schema_version, scanner_build,
           accuracy_gate_corpus_id, accuracy_gate_corpus_version, accuracy_gate_sha256
    from public.scan_publication_releases
    where active = true
    order by activated_at desc
    limit 1
  `);
  const release = releaseResult.rows[0];
  if (!release) throw new Error("No active public scan publication release exists.");
  if (!release.accuracy_gate_corpus_id || !release.accuracy_gate_corpus_version || !/^[0-9a-f]{64}$/i.test(String(release.accuracy_gate_sha256 || ""))) {
    throw new Error("The active public scan publication has no accuracy-gate attestation.");
  }

  const memberResult = await client.query(
    `select scan_id::text from public.scan_publication_release_scans where release_id = $1`,
    [release.id],
  );
  const scanIds = memberResult.rows.map((row) => String(row.scan_id));
  const scans = scanIds.length
    ? (await client.query(`
        select to_jsonb(s) - 'job_id' - 'canonical_report' - 'intelligence_snapshot' as scan
        from public.scans s
        where s.id = any($1::uuid[])
          and s.scan_purpose in ('public_intelligence', 'benchmark')
          and s.analysis_status = 'complete'
          and s.policy_version = $2
          and s.ruleset_version = $3
          and s.score_schema_version = $4
          and s.scanner_build = $5
          and s.superseded_at is null
        order by s.scanned_at desc
      `, [scanIds, release.policy_version, release.ruleset_version, release.score_schema_version, release.scanner_build])).rows.map((row) => row.scan)
    : [];
  const historyScans = scanIds.length ? (await client.query(`
    select jsonb_build_object(
      'id', s.id,
      'extension_id', s.extension_id,
      'version', s.version,
      'artifact_sha256', s.artifact_sha256,
      'severity', s.severity,
      'decision', s.decision,
      'decision_reason', s.decision_reason,
      'public_outcome', s.public_outcome,
      'decision_basis', s.decision_basis,
      'evidence_confidence', s.evidence_confidence,
      'provenance_tier', s.provenance_tier,
      'expected_profile_id', s.expected_profile_id,
      'capability_assessment', s.capability_assessment,
      'score_schema_version', s.score_schema_version,
      'risk_score', s.risk_score,
      'malware_score', s.malware_score,
      'coverage_percent', s.coverage_percent,
      'scanner_build', s.scanner_build,
      'ruleset_version', s.ruleset_version,
      'scanned_at', s.scanned_at
    ) as scan
    from public.scans s
    where s.id = any($1::uuid[])
      and s.scan_purpose in ('public_intelligence', 'benchmark')
      and s.analysis_status = 'complete'
      and s.policy_version = $2
      and s.ruleset_version = $3
      and s.score_schema_version = $4
      and s.scanner_build = $5
      and s.superseded_at is null
    order by s.scanned_at desc
    limit 5000
  `, [scanIds, release.policy_version, release.ruleset_version, release.score_schema_version, release.scanner_build])).rows.map((row) => row.scan) : [];

  const extensions = (await client.query(`
    select to_jsonb(e) as extension
    from public.extensions e
    order by e.catalog_rank asc nulls last, e.display_name asc
  `)).rows.map((row) => row.extension);
  const extensionIds = extensions.map((row) => String(row.id));
  const latestVersions = extensionIds.length
    ? (await client.query(`
        with ranked as (
          select v.*, row_number() over (partition by v.extension_id order by v.is_latest desc, v.published_at desc nulls last, v.version desc) as rank
          from public.extension_versions v
          where v.extension_id = any($1::text[])
        )
        select to_jsonb(ranked) - 'rank' as version
        from ranked
        where rank = 1
      `, [extensionIds])).rows.map((row) => row.version)
    : [];
  const scannedExtensionIds = [...new Set(scans.map((row) => String(row.extension_id)))];
  const scannedVersions = [...new Set(scans.map((row) => String(row.version)))];
  const productVersions = scannedExtensionIds.length
    ? (await client.query(`
        with ranked as (
          select v.*, row_number() over (partition by v.extension_id order by v.is_latest desc, v.published_at desc nulls last, v.version desc) as rank
          from public.extension_versions v
          where v.extension_id = any($1::text[])
        )
        select to_jsonb(ranked) - 'rank' as version
        from ranked
        where rank <= 40 or is_latest or version = any($2::text[])
        order by extension_id, is_latest desc, published_at desc nulls last, version desc
      `, [scannedExtensionIds, scannedVersions])).rows.map((row) => row.version)
    : [];

  const related = await loadRelated(client, scanIds);
  const catalog = extensions.map((extension) => normalizeCatalog(extension, latestVersions.filter((row) => String(row.extension_id) === String(extension.id))));
  const extensionById = new Map(extensions.map((row) => [String(row.id).toLowerCase(), row]));
  const versionByExtension = groupBy(productVersions, (row) => String(row.extension_id).toLowerCase());
  const scanRows = scans.filter((row) => ["allow", "review", "block"].includes(String(row.decision)));
  // Keep the immutable publication mirror large enough for the paginated
  // registry. The page only renders 24 cards at a time, while server-side
  // pages read bounded 240-row windows from this section.
  const inventoryRows = latestByArtifact(scanRows).slice(0, 10000);
  const inventoryItems = inventoryRows.map((scan) => normalizeInventory(scan, extensionById.get(String(scan.extension_id).toLowerCase())));
  const historyItems = latestByExactArtifact(historyScans).slice(0, 1000).map((scan) => normalizeInventory(scan, extensionById.get(String(scan.extension_id).toLowerCase())));
  const inventory = {
    publication: {
      release_id: String(release.id),
      policy_version: String(release.policy_version),
      ruleset_version: String(release.ruleset_version),
      score_schema_version: String(release.score_schema_version),
      scanner_build: String(release.scanner_build),
      accuracy_gate_corpus_id: String(release.accuracy_gate_corpus_id),
      accuracy_gate_corpus_version: String(release.accuracy_gate_corpus_version),
      accuracy_gate_sha256: String(release.accuracy_gate_sha256),
    },
    items: inventoryItems,
    totals: {
      extensions: new Set(inventoryItems.map((item) => item.extension_id)).size,
      releases: inventoryItems.length,
      complete: inventoryItems.filter((item) => item.public_outcome !== "incomplete").length,
      allowed: inventoryItems.filter((item) => item.decision === "allow").length,
      expected: inventoryItems.filter((item) => item.public_outcome === "expected_capability").length,
      investigate: inventoryItems.filter((item) => item.public_outcome === "investigate").length,
      review: inventoryItems.filter((item) => item.decision === "review").length,
      blocked: inventoryItems.filter((item) => item.decision === "block").length,
      lastScannedAt: inventoryItems[0]?.scanned_at || null,
    },
  };
  const feed = latestByArtifact(scanRows.filter((row) => ["review", "block"].includes(String(row.decision))))
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || String(right.scanned_at || "").localeCompare(String(left.scanned_at || "")))
    .slice(0, 80)
    .map((scan) => normalizeFeed(scan, extensionById.get(String(scan.extension_id).toLowerCase())));
  const scansByArtifact = new Map(scans.map((scan) => [artifactKey(scan), scan]));
  const benchmarkRowsWithScans = benchmarkRows.map((row) => {
    const scan = scansByArtifact.get(`${row.id.toLowerCase()}@${row.version}@${row.sha256.toLowerCase()}`);
    return {
      ...row,
      scan: scan && number(scan.coverage_percent) === 100 && String(scan.scanner_build || "") && String(scan.ruleset_version || "")
        ? {
            id: String(scan.id), public_outcome: String(scan.public_outcome || "incomplete"), decision: String(scan.decision || "incomplete"), decision_reason: String(scan.decision_reason || ""), artifact_sha256: String(scan.artifact_sha256),
            scanner_build: String(scan.scanner_build), ruleset_version: String(scan.ruleset_version), coverage_percent: number(scan.coverage_percent), scanned_at: toIso(scan.scanned_at), score_schema_version: String(scan.score_schema_version || "1"),
            severity: String(scan.severity || "INFO"), malware_score: number(scan.malware_score), risk_score: number(scan.risk_score),
          }
        : null,
    };
  });
  const benchmark = { rows: benchmarkRowsWithScans, published: benchmarkRowsWithScans.filter((row) => row.scan).length, awaiting: benchmarkRowsWithScans.filter((row) => !row.scan).length };
  const products = Object.fromEntries(extensions.filter((extension) => scannedExtensionIds.includes(String(extension.id))).map((extension) => {
    const id = String(extension.id);
    const extensionVersions = versionByExtension.get(id.toLowerCase()) || [];
    const extensionScans = scans.filter((scan) => String(scan.extension_id).toLowerCase() === id.toLowerCase()).map((scan) => ({
      version: String(scan.version),
      scan,
      findings: related.findings.get(String(scan.id)) || [],
      files: related.files.get(String(scan.id)) || [],
      dependencies: related.dependencies.get(String(scan.id)) || [],
    }));
    return [id.toLowerCase(), { extension: normalizeCatalog(extension, extensionVersions), versions: extensionVersions, scans: extensionScans }];
  }));

  const metricRow = (await client.query(`select * from public.public_intelligence_metrics()`)).rows[0] || {};
  const freshnessRows = (await client.query(`
    select distinct on (registry) registry, completed_at
    from public.registry_refreshes
    where status = 'complete'
    order by registry, completed_at desc
  `)).rows;
  const freshness = { "vs-marketplace": null, openvsx: null };
  for (const row of freshnessRows) if (row.registry in freshness) freshness[row.registry] = toIso(row.completed_at);
  const metrics = {
    as_of: generatedAt,
    indexed_extensions: number(metricRow.indexed_extensions),
    exact_releases_indexed: number(metricRow.exact_releases_indexed),
    exact_releases_analyzed: number(metricRow.exact_releases_analyzed),
    analyzer_complete_reports: number(metricRow.analyzer_complete_reports),
    known_bad_artifacts: number(metricRow.known_bad_artifacts),
    block_decisions: number(metricRow.block_decisions),
    high_risk_reviews: number(metricRow.high_risk_reviews),
    freshness,
    time_to_analysis: number(metricRow.latency_sample_size) >= 20
      ? { sample_size: number(metricRow.latency_sample_size), median_minutes: Math.round(number(metricRow.median_minutes)), p95_minutes: Math.round(number(metricRow.p95_minutes)), status: "measured" }
      : { sample_size: 0, median_minutes: null, p95_minutes: null, status: "not_measured" },
    definitions: {
      exact_release: "One registry, extension ID, version, and SHA-256 artifact identity.",
      analyzer_complete: "A latest operational report with complete required analysis; coverage is not a safety guarantee.",
      known_bad: "An exact artifact matched authoritative malicious intelligence; REVIEW findings are excluded.",
      latency: "Registry discovery to canonical scan completion. Published only after enough dated release records exist.",
    },
  };

  const snapshot = { schema_version: 1, generated_at: generatedAt, metrics, feed, inventory, history: historyItems, catalog, benchmark, products };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(JSON.stringify({ output, extensions: extensions.length, releases: latestVersions.length, product_releases: productVersions.length, scans: scans.length, inventory: inventoryItems.length, history: historyItems.length, bytes: Buffer.byteLength(JSON.stringify(snapshot)) }));
} finally {
  await client.end();
}

async function loadRelated(db, ids) {
  const result = { findings: new Map(), files: new Map(), dependencies: new Map() };
  if (!ids.length) return result;
  const queries = [
    ["findings", `select scan_id::text, to_jsonb(f) - 'scan_id' as item from public.findings f where f.scan_id = any($1::uuid[])`],
    ["files", `with ranked as (select f.*, row_number() over (partition by f.scan_id order by f.path) as rank from public.artifact_files f where f.scan_id = any($1::uuid[])) select scan_id::text, to_jsonb(ranked) - 'scan_id' - 'rank' as item from ranked where rank <= 5000 order by path`],
    ["dependencies", `select scan_id::text, to_jsonb(d) - 'scan_id' as item from public.dependencies d where d.scan_id = any($1::uuid[]) order by d.relationship, d.name`],
  ];
  for (const [name, sql] of queries) {
    const rows = (await db.query(sql, [ids])).rows;
    for (const row of rows) {
      const items = result[name].get(row.scan_id) || [];
      items.push(row.item);
      result[name].set(row.scan_id, items);
    }
  }
  return result;
}

function normalizeCatalog(row, versions) {
  const latest = versions.find((item) => item.is_latest) || versions[0];
  return {
    id: String(row.id),
    name: String(row.name || ""),
    display_name: String(row.display_name || row.name || row.id),
    publisher: String(row.publisher || String(row.id).split(".")[0]),
    description: String(row.description || ""),
    registry: String(row.registry || "vs-marketplace"),
    publisher_verified: Boolean(row.publisher_verified),
    installs: number(row.installs),
    rating: number(row.rating),
    icon_url: String(row.icon_url || ""),
    repository_url: String(row.repository_url || ""),
    last_published_at: toIso(row.last_published_at),
    catalog_rank: row.catalog_rank == null ? null : number(row.catalog_rank),
    ...(latest ? { latest_version: String(latest.version || "") } : {}),
    latest_scan: null,
  };
}

function normalizeFeed(scan, extension) {
  return {
    scan_id: String(scan.id),
    extension_id: String(scan.extension_id),
    version: String(scan.version),
    display_name: String(extension?.display_name || scan.extension_id),
    severity: String(scan.severity || "INFO"),
    decision: normalizeDecision(scan.decision),
    public_outcome: String(scan.public_outcome || legacyOutcome(scan)),
    decision_basis: String(scan.decision_basis || "legacy_scanner_result"),
    evidence_confidence: String(scan.evidence_confidence || "none"),
    scanned_at: toIso(scan.scanned_at),
    coverage_percent: number(scan.coverage_percent),
    decision_reason: String(scan.decision_reason || "Open the exact artifact evidence."),
  };
}

function normalizeInventory(scan, extension) {
  const assessment = objectValue(scan.capability_assessment);
  const matched = Array.isArray(assessment.matched) ? assessment.matched.map(String) : [];
  return {
    ...normalizeFeed(scan, extension),
    publisher: String(extension?.publisher || String(scan.extension_id).split(".")[0]),
    publisher_verified: Boolean(extension?.publisher_verified),
    description: matched.length ? `Expected: ${matched.map((item) => item.replaceAll("_", " ")).join(", ")}` : String(scan.decision_reason || extension?.description || "Open the exact artifact evidence."),
    icon_url: String(extension?.icon_url || ""),
    risk_score: number(scan.risk_score),
    malware_score: number(scan.malware_score),
    artifact_sha256: String(scan.artifact_sha256 || ""),
    provenance_tier: String(scan.provenance_tier || "unknown"),
    expected_profile_id: String(scan.expected_profile_id || ""),
    capability_assessment: assessment,
    scanner_build: String(scan.scanner_build || "unknown"),
    ruleset_version: String(scan.ruleset_version || "unknown"),
    score_schema_version: String(scan.score_schema_version || "1"),
  };
}

function latestByArtifact(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = `${String(row.extension_id).toLowerCase()}@${row.version}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

function latestByExactArtifact(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = artifactKey(row);
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

function artifactKey(row) {
  return `${String(row.extension_id).toLowerCase()}@${String(row.version)}@${String(row.artifact_sha256).toLowerCase()}`;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(key(row)) || [];
    group.push(row);
    groups.set(key(row), group);
  }
  return groups;
}

function normalizeDecision(value) {
  return ["allow", "review", "block"].includes(String(value)) ? String(value) : "incomplete";
}

function legacyOutcome(row) {
  if (row.decision === "allow") return "clear";
  if (row.decision === "review") return "investigate";
  if (row.decision === "block" && row.verdict === "malicious") return "confirmed_threat";
  if (row.decision === "block") return "preventive_block";
  return "incomplete";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function severityRank(value) {
  return ({ CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 })[String(value)] || 0;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
