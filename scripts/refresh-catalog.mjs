import { createPostgresClient } from "../lib/postgresDb.ts";

const gallery = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1";
const MARKETPLACE_RETRIES = 4;
const RETRYABLE_MARKETPLACE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
function databaseConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = String(process.env.SUPABASE_PASSWORD || "").trim();
  if (!password) throw new Error("DATABASE_URL or SUPABASE_PASSWORD is required for direct Postgres catalog refresh.");
  return `postgresql://postgres.kmdujtabqaxgoeltbxpq:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require`;
}

// Supabase REST is restricted while the project is over its egress quota. Use
// the direct Postgres path instead; it preserves the same writes without
// routing the catalog refresh through the restricted service layer.
const db = createPostgresClient(databaseConnectionString());
const scanLimit = Number(process.env.SCAN_BATCH_LIMIT || 100);
const refreshStartedAt = new Date().toISOString();
const scannerBuild = process.env.SCANNER_BUILD_SHA || await currentScannerBuild();
const chunks = (items, size = 60) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
let terminating = false;
process.on("uncaughtException", async (error) => {
  if (terminating) return;
  terminating = true;
  const message = error instanceof Error ? error.message : String(error);
  try { await db.from("registry_refreshes").update({ status: "failed", completed_at: new Date().toISOString(), error: message.slice(0, 1000) }).eq("started_at", refreshStartedAt).eq("status", "running"); }
  catch { /* The original failure remains authoritative. */ }
  console.error(error);
  process.exit(1);
});

async function queryGallery(body) {
  let lastError;
  for (let attempt = 0; attempt < MARKETPLACE_RETRIES; attempt += 1) {
    try {
      const response = await fetch(gallery, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1", "User-Agent": "ide-scanner-catalog-refresh" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const error = new Error(`Marketplace returned ${response.status}`);
        if (!RETRYABLE_MARKETPLACE_STATUSES.has(response.status) || attempt === MARKETPLACE_RETRIES - 1) throw error;
        lastError = error;
      } else {
        return response.json();
      }
    } catch (error) {
      lastError = error;
      if (attempt === MARKETPLACE_RETRIES - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw lastError || new Error("Marketplace request failed.");
}

async function marketplacePage(page) {
  const payload = await queryGallery({ filters: [{ criteria: [{ filterType: 8, value: "Microsoft.VisualStudio.Code" }], pageNumber: page, pageSize: 100, sortBy: 4 }], flags: 914 });
  return payload.results?.[0]?.extensions || [];
}

function normalizeMarketplace(raw) {
  const publisher = raw.publisher?.publisherName || "unknown"; const name = raw.extensionName; const version = raw.versions?.[0] || {};
  const stats = Object.fromEntries((raw.statistics || []).map((item) => [String(item.statisticName).toLowerCase(), Number(item.value || 0)]));
  const icon = version.files?.find((item) => item.assetType?.includes("Icons.Small"))?.source || "";
  return { id: `${publisher}.${name}`, name, display_name: raw.displayName || name, publisher, description: raw.shortDescription || "", registry: "vs-marketplace", publisher_verified: Boolean(raw.publisher?.isDomainVerified || raw.publisher?.isVerified || String(raw.publisher?.flags || "").toLowerCase().includes("verified")), installs: stats.install || 0, rating: stats.averagerating || 0, icon_url: icon, last_published_at: version.lastUpdated || raw.lastUpdated || null, version: version.version || "", published_at: version.lastUpdated || null };
}

async function openVsxTop() {
  const response = await fetch("https://open-vsx.org/api/-/search?size=100&sortBy=downloadCount&sortOrder=desc");
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.extensions || []).map((raw) => ({ id: `${raw.namespace}.${raw.name}`, name: raw.name, display_name: raw.displayName || raw.name, publisher: raw.namespace, description: raw.description || "", registry: "openvsx", publisher_verified: Boolean(raw.verified), installs: Number(raw.downloadCount || 0), rating: Number(raw.averageRating || 0), icon_url: raw.files?.icon || "", last_published_at: raw.timestamp || null, version: raw.version || "", published_at: raw.timestamp || null }));
}

async function versionsFor(extension) {
  if (extension.registry === "openvsx") {
    const response = await fetch(`https://open-vsx.org/api/${encodeURIComponent(extension.publisher)}/${encodeURIComponent(extension.name)}`);
    if (!response.ok) return [extension];
    const raw = await response.json(); const values = Object.keys(raw.allVersions || {});
    return (values.length ? values : [extension.version]).map((version, index) => ({ ...extension, version, published_at: version === raw.version ? raw.timestamp : null, is_latest: version === raw.version || index === 0, download_url: version === raw.version ? String(raw.files?.download || "") : `https://open-vsx.org/api/${encodeURIComponent(extension.publisher)}/${encodeURIComponent(extension.name)}/${encodeURIComponent(version)}/file/${encodeURIComponent(extension.publisher)}.${encodeURIComponent(extension.name)}-${encodeURIComponent(version)}.vsix` }));
  }
  const payload = await queryGallery({ filters: [{ criteria: [{ filterType: 7, value: extension.id }], pageNumber: 1, pageSize: 1 }], flags: 402 });
  return (payload.results?.[0]?.extensions?.[0]?.versions || []).map((version, index) => ({ ...extension, version: version.version, published_at: version.lastUpdated || null, is_latest: index === 0, download_url: `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${encodeURIComponent(extension.publisher)}/vsextensions/${encodeURIComponent(extension.name)}/${encodeURIComponent(version.version)}/vspackage` }));
}

const [marketplacePages, openVsx] = await Promise.all([Promise.all([1, 2, 3].map(marketplacePage)), openVsxTop()]);
const marketplace = marketplacePages.flat().map(normalizeMarketplace);
const combined = [...marketplace, ...openVsx];
const unique = new Map(); for (const item of combined.sort((a, b) => b.installs - a.installs)) if (!unique.has(item.id.toLowerCase())) unique.set(item.id.toLowerCase(), item);
const cohort = [...unique.values()].slice(0, 250).map((item, index) => ({ ...item, catalog_rank: index + 1 }));

// Watched extensions outside the top cohort must still be refreshed. Otherwise a
// user can watch a long-tail extension that is never version-detected, scanned, or
// alerted — the watchlist would silently produce nothing.
const cohortIds = new Set(cohort.map((item) => item.id.toLowerCase()));
const [personalWatchedRows, teamWatchedRows] = await Promise.all([
  db.from("watchlist_items").select("extension_id"),
  db.from("team_watchlist_items").select("extension_id").eq("monitoring_state", "monitoring"),
]);
if (personalWatchedRows.error) throw personalWatchedRows.error;
if (teamWatchedRows.error) throw teamWatchedRows.error;
const watchedIds = [...new Set([...(personalWatchedRows.data || []), ...(teamWatchedRows.data || [])].map((item) => String(item.extension_id || "")).filter(Boolean))].filter((id) => !cohortIds.has(id.toLowerCase()));
for (const batch of chunks(watchedIds, 200)) {
  const result = await db.from("extensions").select("id,name,display_name,publisher,description,registry,publisher_verified,installs,rating,icon_url,last_published_at,catalog_rank").in("id", batch);
  if (result.error) throw result.error;
  for (const row of result.data || []) cohort.push({ ...row, registry: row.registry || "vs-marketplace", catalog_rank: row.catalog_rank ?? null });
}

const refreshRows = ["vs-marketplace", "openvsx"].map((registry) => ({ registry, status: "running", started_at: refreshStartedAt }));
await db.from("registry_refreshes").insert(refreshRows);
const refreshIds = new Map();
const createdRefreshes = await db.from("registry_refreshes").select("id,registry").eq("started_at", refreshStartedAt);
for (const row of createdRefreshes.data || []) refreshIds.set(row.registry, row.id);

for (const extension of cohort) {
  const { error } = await db.from("extensions").upsert({ id: extension.id, name: extension.name, display_name: extension.display_name, publisher: extension.publisher, description: extension.description, registry: extension.registry, publisher_verified: extension.publisher_verified, installs: extension.installs, rating: extension.rating, icon_url: extension.icon_url, last_published_at: extension.last_published_at, catalog_rank: extension.catalog_rank, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

let queued = 0;
const queuedByRegistry = { "vs-marketplace": 0, openvsx: 0 };
for (const extension of cohort) {
  const versions = await versionsFor(extension).catch(() => [extension]);
  const seenVersions = new Set();
  const rows = versions
    .map((item, index) => ({ extension_id: extension.id, version: item.version, registry: extension.registry, published_at: item.published_at, download_url: item.download_url || null, is_latest: Boolean(item.is_latest ?? index === 0), discovered_at: refreshStartedAt, last_seen_at: refreshStartedAt }))
    .filter((item) => {
      if (!item.version || item.version.trim().toLowerCase() === "latest" || seenVersions.has(item.version)) return false;
      seenVersions.add(item.version);
      return true;
    });
  // Remember which releases existed before this refresh. A watch alert is only
  // useful for a newly observed release; repeating it every six hours would
  // train people to ignore the monitor.
  const existingVersionBatches = await Promise.all(chunks(rows.map((item) => item.version)).map((versions) => db.from("extension_versions").select("version").eq("extension_id", extension.id).in("version", versions)));
  const existingVersionError = existingVersionBatches.find((result) => result.error)?.error;
  if (existingVersionError) throw existingVersionError;
  const known = new Set(existingVersionBatches.flatMap((result) => result.data || []).map((item) => item.version));
  const newlyObserved = rows.filter((item) => !known.has(item.version) && item.is_latest);
  if (rows.length) { const result = await db.from("extension_versions").upsert(rows, { onConflict: "extension_id,version" }); if (result.error) throw result.error; }
  const monitoredReleases = new Set();
  for (const release of newlyObserved) if (await notifyWatchersOfRelease(extension.id, release.version)) monitoredReleases.add(release.version);
  for (const item of rows.slice(0, 4)) {
    const monitoredRelease = monitoredReleases.has(item.version);
    // A watched release is a customer promise. It receives capacity even when
    // the public catalog batch is saturated; ordinary catalog scans wait.
    if (queued >= scanLimit && !monitoredRelease) break;
    const existing = await db.from("extension_versions").select("scan_state").eq("extension_id", extension.id).eq("version", item.version).single();
    if (["queued", "running"].includes(existing.data?.scan_state)) continue;
    const canonical = await db.from("scans").select("id").eq("extension_id", extension.id).eq("version", item.version).eq("scan_purpose", "public_intelligence").eq("score_schema_version", "2").eq("scanner_build", scannerBuild).eq("analysis_status", "complete").is("superseded_at", null).limit(1).maybeSingle();
    if (canonical.error) throw canonical.error;
    if (canonical.data) continue;
    const job = await db.from("scan_jobs").insert({ extension_id: extension.id, version: item.version, profile: "deep", requester_hash: "catalog-refresh", scan_purpose: "public_intelligence", expected_scanner_build: scannerBuild }).select("id").single();
    if (job.error) continue;
    await db.from("extension_versions").update({ scan_state: "queued" }).eq("extension_id", extension.id).eq("version", item.version);
    if (monitoredRelease) {
      const releaseUpdate = await db.from("team_release_events").update({ state: "scan_queued", updated_at: new Date().toISOString() }).eq("extension_id", extension.id).eq("target_version", item.version).eq("state", "release_detected");
      if (releaseUpdate.error) throw releaseUpdate.error;
    }
    queued += 1;
    queuedByRegistry[extension.registry] += 1;
  }
}

async function notifyWatchersOfRelease(extensionId, version) {
  const items = await db.from("team_watchlist_items").select("team_id,baseline_scan_id,baseline_version,monitoring_state").eq("extension_id", extensionId).eq("monitoring_state", "monitoring");
  if (items.error) throw items.error;
  const watches = (items.data || []).filter((item) => item.team_id && item.baseline_scan_id && item.baseline_version);
  if (!watches.length) return false;
  const events = watches.map((watch) => ({ team_id: watch.team_id, extension_id: extensionId, baseline_scan_id: watch.baseline_scan_id, baseline_version: watch.baseline_version, target_version: version, state: "release_detected", materiality: "analysis_unavailable", dedupe_key: `release:${extensionId}@${version}` }));
  const eventWrite = await db.from("team_release_events").upsert(events, { onConflict: "team_id,dedupe_key", ignoreDuplicates: true });
  if (eventWrite.error) throw eventWrite.error;
  const observedAt = new Date().toISOString();
  const watchUpdate = await db.from("team_watchlist_items")
    .update({ last_observed_version: version, last_event_at: observedAt })
    .eq("extension_id", extensionId)
    .eq("monitoring_state", "monitoring")
    .in("team_id", watches.map((watch) => watch.team_id));
  if (watchUpdate.error) throw watchUpdate.error;
  const badgeUpdate = await db.from("team_badges")
    .update({ status: "stale", updated_at: observedAt })
    .in("team_id", watches.map((watch) => watch.team_id))
    .eq("extension_id", extensionId)
    .eq("status", "ready")
    .neq("version", version)
    .select("id,team_id,version");
  if (badgeUpdate.error) throw badgeUpdate.error;
  for (const badge of badgeUpdate.data || []) {
    const history = await db.from("team_audit_events").insert({ team_id: badge.team_id, actor_id: null, action: "team_badge_stale", object_type: "badge", object_id: badge.id, extension_id: extensionId, version: badge.version, resulting_state: { status: "stale", observed_version: version, refresh_recommended: true } });
    if (history.error) throw history.error;
  }
  const alerts = watches.map((watch) => ({
    team_id: watch.team_id,
    extension_id: extensionId,
    version,
    kind: "release_detected",
    title: `New release detected: ${extensionId}@${version}`,
    summary: "A watched extension published a new exact artifact. GuardRails is reserving Deep Scan capacity and will update this alert when evidence is available.",
    metadata: { scan_queued: false, baseline_version: watch.baseline_version, release_event: true, badge_refresh_recommended: true },
    dedupe_key: `release:${extensionId}@${version}`,
  }));
  if (alerts.length) {
    const result = await db.from("team_monitoring_alerts").upsert(alerts, { onConflict: "team_id,dedupe_key", ignoreDuplicates: true });
    if (result.error) throw result.error;
  }
  return true;
}

const releasesByRegistry = { "vs-marketplace": 0, openvsx: 0 };
for (const item of cohort) releasesByRegistry[item.registry] += 1;
for (const registry of ["vs-marketplace", "openvsx"]) {
  const id = refreshIds.get(registry);
  if (!id) continue;
  await db.from("registry_refreshes").update({ status: "complete", completed_at: new Date().toISOString(), extensions_seen: cohort.filter((item) => item.registry === registry).length, releases_seen: releasesByRegistry[registry], releases_queued: queuedByRegistry[registry] }).eq("id", id);
}

console.log(JSON.stringify({ extensions: cohort.length, deep_scans_queued: queued }));

async function currentScannerBuild() {
  const repository = process.env.SCANNER_REPOSITORY || "preethamak/IDE_Scanner";
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "ide-scanner-catalog-refresh" } });
  if (!response.ok) throw new Error(`Could not resolve the canonical scanner build (${response.status}).`);
  const body = await response.json();
  const sha = String(body.sha || "");
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Canonical scanner build identity is invalid.");
  return sha;
}
