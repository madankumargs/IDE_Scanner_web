import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const VALID_DECISIONS = new Set(["allow", "review", "block"]);

const output = valueAfter("--out") || "public/registry-snapshot.json";
const marketplacePageCount = boundedInteger("MARKETPLACE_PAGE_COUNT", 3, 1, 50);
const activeRelease = queryD1(`
  SELECT id,policy_version,ruleset_version,score_schema_version,scanner_build,expected_reports,
         accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256
  FROM app_scan_publication_releases
  WHERE active=1
  LIMIT 1
`)[0];
if (!activeRelease) throw new Error("No active Cloudflare scan publication release exists.");

const rows = queryD1(`
  SELECT p.extension_id,p.version,p.artifact_sha256,r.scan_id,r.created_at,r.report_json
  FROM app_scan_publication_release_reports p
  JOIN app_scan_publication_releases release ON release.id=p.release_id
  JOIN app_scan_reports r ON r.scan_id=p.scan_id
  WHERE release.id=${sql(activeRelease.id)}
  ORDER BY p.extension_id,p.version
`);
if (!rows.length || rows.length !== Number(activeRelease.expected_reports || rows.length)) {
  throw new Error(`Active release member count is inconsistent: expected ${activeRelease.expected_reports}, found ${rows.length}.`);
}

const marketplace = (await Promise.all(
  Array.from({ length: marketplacePageCount }, (_, index) => marketplacePage(index + 1)),
)).flat();
const marketplaceById = new Map(marketplace.map((item) => [item.id.toLowerCase(), item]));
const parsed = rows.map(parseReleaseRow);
const catalog = parsed.map((item) => buildCatalog(item, marketplaceById.get(item.extensionId.toLowerCase())));
const catalogById = new Map(catalog.map((item) => [item.id.toLowerCase(), item]));
const inventoryItems = parsed.map((item) => normalizeInventory(item, catalogById.get(item.extensionId.toLowerCase())));
const feed = inventoryItems
  .filter((item) => item.decision === "review" || item.decision === "block")
  .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || String(right.scanned_at).localeCompare(String(left.scanned_at)))
  .slice(0, 80);
  const products = Object.fromEntries(parsed.map((item) => {
    const extension = catalogById.get(item.extensionId.toLowerCase());
    const version = buildVersion(item, extension);
    return [item.extensionId.toLowerCase(), {
      // Full evidence remains in app_scan_reports and is served through the
      // private D1 binding. The public registry is an indexed catalogue and
      // deliberately carries a bounded summary so 10k products remain within
      // D1 and Worker response limits. Consumers must not present this as a
      // complete immutable report when the private report is unavailable.
      detail_state: "summary_only",
      extension,
      versions: [version],
      scans: [{
        version: item.version,
        scan: item.scan,
        findings: [],
        files: [],
        dependencies: [],
      }],
    }];
  }));

const generatedAt = new Date().toISOString();
const snapshot = {
  schema_version: 1,
  generated_at: generatedAt,
  metrics: buildMetrics(generatedAt, inventoryItems),
  feed,
  inventory: {
    publication: {
      release_id: String(activeRelease.id),
      policy_version: String(activeRelease.policy_version),
      ruleset_version: String(activeRelease.ruleset_version),
      score_schema_version: String(activeRelease.score_schema_version),
      scanner_build: String(activeRelease.scanner_build),
      accuracy_gate_corpus_id: String(activeRelease.accuracy_gate_corpus_id),
      accuracy_gate_corpus_version: String(activeRelease.accuracy_gate_corpus_version),
      accuracy_gate_sha256: String(activeRelease.accuracy_gate_sha256),
    },
    items: inventoryItems,
    totals: {
      extensions: new Set(inventoryItems.map((item) => item.extension_id)).size,
      releases: inventoryItems.length,
      complete: inventoryItems.length,
      allowed: inventoryItems.filter((item) => item.decision === "allow").length,
      expected: inventoryItems.filter((item) => item.public_outcome === "expected_capability").length,
      investigate: inventoryItems.filter((item) => item.public_outcome === "investigate").length,
      review: inventoryItems.filter((item) => item.decision === "review").length,
      blocked: inventoryItems.filter((item) => item.decision === "block").length,
      lastScannedAt: inventoryItems.map((item) => item.scanned_at).sort().at(-1) || null,
    },
  },
  history: inventoryItems,
  catalog,
  benchmark: { rows: [], published: 0, awaiting: 0 },
  products,
};

await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, release_id: activeRelease.id, scanner_build: activeRelease.scanner_build, extensions: catalog.length, releases: inventoryItems.length, bytes: Buffer.byteLength(JSON.stringify(snapshot)) }, null, 2));

function parseReleaseRow(row) {
  let bundle;
  try { bundle = JSON.parse(String(row.report_json || "")); }
  catch (error) { throw new Error(`Invalid report JSON for ${row.extension_id}@${row.version}: ${error.message}`); }
  const metadata = object(bundle.metadata);
  const detail = singleExtensionDetail(bundle.extensions);
  const coverage = object(detail.analysis_coverage);
  const identity = object(detail.artifact_identity);
  if (String(detail.analysis_status) !== "complete" || coverage.status !== "complete" || coverage.required_providers_complete !== true) {
    throw new Error(`Active release contains an incomplete report for ${row.extension_id}@${row.version}.`);
  }
  if (!VALID_DECISIONS.has(String(detail.decision)) || String(identity.sha256).toLowerCase() !== String(row.artifact_sha256).toLowerCase()) {
    throw new Error(`Active release contains an invalid canonical identity for ${row.extension_id}@${row.version}.`);
  }
  const rawInventory = object(detail.artifact_inventory);
  const rawFiles = Array.isArray(rawInventory.files) ? rawInventory.files : [];
  const previews = new Set((Array.isArray(rawInventory.source_previews) ? rawInventory.source_previews : []).map((item) => String(item?.path || "")));
  const files = rawFiles.map((file) => ({
    path: String(file?.path || ""),
    sha256: String(file?.sha256 || ""),
    size_bytes: Number(file?.size_bytes || 0),
    kind: String(file?.kind || "file"),
    preview_available: previews.has(String(file?.path || "")),
  })).filter((file) => file.path);
  const compactInventory = { ...rawInventory };
  delete compactInventory.files;
  delete compactInventory.source_previews;
  delete compactInventory._all_file_hashes;
  compactInventory.file_count = rawFiles.length;
  const { findings: _findings, dependency_inventory: _dependencies, ...compactDetail } = detail;
  const scan = {
    // The public product keeps findings, files, and dependencies in their
    // own typed collections below. Keeping those same arrays inside the scan
    // object and then copying the scan into the catalog doubled the largest
    // reports and made registry growth quadratic in practice.
    ...compactDetail,
    id: String(row.scan_id),
    scan_id: String(row.scan_id),
    profile: String(metadata.profile || "deep"),
    schema_version: String(metadata.schema_version || ""),
    scanner_version: String(metadata.scanner_version || ""),
    policy_version: String(metadata.policy_version || ""),
    ruleset_version: String(metadata.ruleset_version || ""),
    scanner_build: String(metadata.scanner_build || ""),
    scanned_at: String(row.created_at || metadata.created_at || ""),
    artifact_sha256: String(identity.sha256 || row.artifact_sha256),
    coverage_percent: Number(coverage.executable_file_coverage_percent ?? coverage.coverage_percent ?? 0),
    artifact_inventory: compactInventory,
  };
  return {
    extensionId: String(row.extension_id),
    version: String(row.version),
    scan,
    findings: Array.isArray(detail.findings) ? detail.findings : [],
    files,
    dependencies: Array.isArray(detail.dependency_inventory) ? detail.dependency_inventory : [],
    createdAt: String(row.created_at || metadata.created_at || ""),
  };
}

function buildCatalog(item, marketplace) {
  const [publisher, ...nameParts] = item.extensionId.split(".");
  const name = nameParts.join(".") || item.extensionId;
  return {
    id: item.extensionId,
    name,
    display_name: String(marketplace?.displayName || name),
    publisher: String(marketplace?.publisher || publisher || "unknown"),
    description: String(marketplace?.description || item.scan.description || ""),
    registry: "vs-marketplace",
    publisher_verified: Boolean(marketplace?.publisherVerified),
    installs: Number(marketplace?.installs || 0),
    rating: Number(marketplace?.rating || 0),
    icon_url: String(marketplace?.iconUrl || ""),
    repository_url: "",
    last_published_at: marketplace?.lastPublishedAt || null,
    catalog_rank: marketplace?.rank ?? null,
    latest_version: item.version,
    // The exact report is available under products[id].scans. Avoid copying
    // it into every catalog row as well.
    latest_scan: null,
  };
}

function buildVersion(item, extension) {
  return {
    extension_id: item.extensionId,
    version: item.version,
    registry: "vs-marketplace",
    published_at: extension?.last_published_at || null,
    download_url: marketplaceDownloadUrl(item.extensionId, item.version),
    is_latest: true,
    latest_scan_id: item.scan.id,
    scan_state: item.scan.analysis_status,
    decision: item.scan.decision,
    coverage_percent: item.scan.coverage_percent,
    scanned_at: item.scan.scanned_at,
    artifact_sha256: item.scan.artifact_sha256,
  };
}

function normalizeInventory(item, extension) {
  const scan = item.scan;
  const assessment = object(scan.capability_assessment);
  return {
    scan_id: String(scan.id),
    extension_id: item.extensionId,
    version: item.version,
    display_name: String(extension?.display_name || item.extensionId),
    publisher: String(extension?.publisher || item.extensionId.split(".")[0]),
    publisher_verified: Boolean(extension?.publisher_verified),
    description: String(scan.decision_reason || extension?.description || "Open the exact artifact evidence."),
    icon_url: String(extension?.icon_url || ""),
    severity: String(scan.severity || "INFO"),
    decision: String(scan.decision),
    public_outcome: String(scan.public_outcome || ""),
    decision_basis: String(scan.decision_basis || ""),
    evidence_confidence: String(scan.evidence_confidence || ""),
    provenance_tier: String(scan.provenance?.tier || "unknown"),
    expected_profile_id: String(assessment.profile_id || ""),
    capability_assessment: assessment,
    scanned_at: String(scan.scanned_at || ""),
    coverage_percent: Number(scan.coverage_percent || 0),
    decision_reason: String(scan.decision_reason || "Open the exact artifact evidence."),
    risk_score: Number(scan.risk_score || 0),
    malware_score: Number(scan.malware_score || 0),
    artifact_sha256: String(scan.artifact_sha256),
    scanner_build: String(scan.scanner_build),
    ruleset_version: String(scan.ruleset_version),
    score_schema_version: String(scan.score_schema_version || "2"),
  };
}

function buildMetrics(asOf, items) {
  return {
    as_of: asOf,
    indexed_extensions: new Set(items.map((item) => item.extension_id)).size,
    exact_releases_indexed: items.length,
    exact_releases_analyzed: items.length,
    analyzer_complete_reports: items.length,
    known_bad_artifacts: items.filter((item) => item.public_outcome === "confirmed_threat").length,
    block_decisions: items.filter((item) => item.decision === "block").length,
    high_risk_reviews: items.filter((item) => item.decision === "review" && ["HIGH", "CRITICAL"].includes(item.severity)).length,
    freshness: { "vs-marketplace": asOf, openvsx: null },
    time_to_analysis: { sample_size: 0, median_minutes: null, p95_minutes: null, status: "not_measured" },
    definitions: {
      exact_release: "One registry, extension ID, version, and SHA-256 artifact identity.",
      analyzer_complete: "A latest operational report with complete required analysis; coverage is not a safety guarantee.",
      known_bad: "An exact artifact matched authoritative malicious intelligence; REVIEW findings are excluded.",
      latency: "Registry discovery to canonical scan completion. Published only after enough dated release records exist.",
    },
  };
}

async function marketplacePage(page) {
  const response = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1", "User-Agent": "guardrails-public-registry-export" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 8, value: "Microsoft.VisualStudio.Code" }], pageNumber: page, pageSize: 100, sortBy: 4 }], flags: 914 }),
  });
  if (!response.ok) throw new Error(`Marketplace catalog request failed with HTTP ${response.status} on page ${page}.`);
  const payload = await response.json();
  return (payload?.results?.[0]?.extensions || []).flatMap((raw, index) => {
    const publisher = String(raw?.publisher?.publisherName || "").trim();
    const name = String(raw?.extensionName || "").trim();
    const version = String(raw?.versions?.[0]?.version || "").trim();
    if (!publisher || !name || !version) return [];
    const stats = Object.fromEntries((raw.statistics || []).map((stat) => [String(stat.statisticName || "").toLowerCase(), Number(stat.value || 0)]));
    const file = raw.versions?.[0]?.files?.find((asset) => asset.assetType === "Microsoft.VisualStudio.Services.Icons.Small")
      || raw.versions?.[0]?.files?.find((asset) => asset.assetType === "Microsoft.VisualStudio.Services.Icons.Default");
    return [{
      id: `${publisher}.${name}`,
      displayName: String(raw.displayName || name),
      publisher,
      description: String(raw.shortDescription || ""),
      publisherVerified: Boolean(raw.publisher?.isDomainVerified || String(raw.publisher?.flags || "").toLowerCase().includes("verified")),
      installs: Number(stats.install || 0),
      rating: Number(stats.averagerating || 0),
      iconUrl: String(file?.source || ""),
      lastPublishedAt: String(raw.versions?.[0]?.lastUpdated || raw.lastUpdated || "") || null,
      version,
      rank: (page - 1) * 100 + index + 1,
    }];
  });
}

function marketplaceDownloadUrl(id, version) {
  const [publisher, ...nameParts] = id.split(".");
  return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${encodeURIComponent(publisher)}/vsextensions/${encodeURIComponent(nameParts.join("."))}/${encodeURIComponent(version)}/vspackage`;
}

function queryD1(command) {
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", "abscissa-registry", "--remote", "--command", command, "--json"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const payload = JSON.parse(raw);
  return Array.isArray(payload?.[0]?.results) ? payload[0].results : [];
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = String(process.env[name] || "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return value;
}

function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function singleExtensionDetail(value) {
  const entries = Array.isArray(value) ? value : Object.values(object(value));
  const valid = entries.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  return valid.length === 1 ? valid[0] : {};
}
function severityRank(value) { return ({ CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 })[String(value)] || 0; }
