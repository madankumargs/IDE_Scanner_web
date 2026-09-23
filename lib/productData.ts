import { publicDb, serviceDb } from "@/lib/supabase";
import { isConcreteVersion, listMarketplaceVersions, resolveMarketplaceExtension, searchMarketplace } from "@/lib/marketplace";
import { getPublicRegistryProduct, getPublicRegistrySnapshot } from "@/lib/publicRegistrySnapshot";
import { getCloudflareRegistryCatalogExtension, getCloudflareRegistryProduct, getCloudflareRegistrySection } from "@/lib/cloudflareRegistry";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudflarePrivateAvailable, getCloudflareScanProduct, getCloudflareScanSummary } from "@/lib/cloudflareDeepScan";
import { hasAccuracyGateAttestation } from "@/lib/publicationHealth";

const cachedVersions=unstable_cache(async(id:string)=>listMarketplaceVersions(id),["registry-versions-v2"],{revalidate:21600,tags:["registry-versions"]});
const MAX_RENDERED_VERSION_HISTORY = 120;

export type CatalogExtension = {
  id: string;
  name: string;
  display_name: string;
  publisher: string;
  description: string;
  registry: string;
  publisher_verified: boolean;
  installs: number;
  rating: number;
  icon_url: string;
  repository_url: string;
  last_published_at: string | null;
  catalog_rank: number | null;
  latest_version?: string;
  latest_scan?: Record<string, unknown> | null;
};

export type ScanDecision = "allow" | "review" | "block" | "incomplete";
export type PublicSecurityFeedItem = { scan_id: string; extension_id: string; version: string; display_name: string; severity: string; decision: ScanDecision; public_outcome: string; decision_basis: string; evidence_confidence: string; scanned_at: string; coverage_percent: number; decision_reason: string };
export type PublicInventoryItem = PublicSecurityFeedItem & { publisher: string; publisher_verified: boolean; description: string; icon_url: string; risk_score: number; malware_score: number; artifact_sha256: string; provenance_tier: string; expected_profile_id: string; capability_assessment: Record<string, unknown>; scanner_build: string; ruleset_version: string; score_schema_version: string };
export type PublicInventory = { items: PublicInventoryItem[]; totals: { extensions: number; releases: number; complete: number; allowed: number; expected: number; investigate: number; review: number; blocked: number; lastScannedAt: string | null }; publication?: { accuracy_gate_corpus_id?: unknown; accuracy_gate_corpus_version?: unknown; accuracy_gate_sha256?: unknown } };
export type PublicAnalysisHistory = { items: PublicInventoryItem[]; total: number; complete: number; pending: number };

const cachedSecurityFeed=unstable_cache(async(limit:number)=>fetchPublicSecurityFeed(limit).catch(() => []),["public-feed-v1"],{revalidate:300,tags:["public-intel"]});
const cachedPublicInventory=unstable_cache(async(limit:number,offset:number)=>fetchPublicInventory(limit,offset).catch(() => emptyInventory()),["public-inventory-v2"],{revalidate:300,tags:["public-intel"]});
const cachedPublicAnalysisHistory=unstable_cache(async(limit:number,offset:number)=>fetchPublicAnalysisHistory(limit,offset).catch(() => emptyAnalysisHistory()),["public-analysis-history-v1"],{revalidate:300,tags:["public-intel"]});
const cachedCatalog=unstable_cache(async(query:string,limit:number)=>fetchCatalog(query,limit),["public-catalog-v1"],{revalidate:300,tags:["public-intel","catalog"]});

export function getPublicSecurityFeed(limit = 6): Promise<PublicSecurityFeedItem[]> { return cachedSecurityFeed(limit); }

/** Current-policy reproducible scans only. Development and private work never enter this catalog. */
export function getPublicInventory(limit = 240, offset = 0): Promise<PublicInventory> {
  return cachedPublicInventory(Math.min(Math.max(Math.floor(limit), 1), 240), Math.max(Math.floor(offset), 0));
}

export function getPublicAnalysisHistory(limit = 24, offset = 0): Promise<PublicAnalysisHistory> {
  return cachedPublicAnalysisHistory(Math.min(Math.max(limit, 1), 100), Math.max(offset, 0));
}

export function listCatalog(query = "", limit = 50): Promise<CatalogExtension[]> { return cachedCatalog(query, limit); }

async function fetchPublicSecurityFeed(limit = 6): Promise<PublicSecurityFeedItem[]> {
  const mirror = async () => (await getPublicRegistrySnapshot())?.feed.slice(0, limit) || [];
  const db = publicDb();
  if (!db) return mirror();
  try {
    const classification = await activePublicClassification(db);
    if (!classification || !classification.scanIds || classification.scanIds.length === 0) return mirror();
    let request = db.from("scans").select("id,extension_id,version,severity,decision,public_outcome,decision_basis,evidence_confidence,scanned_at,coverage_percent,decision_reason").in("scan_purpose", ["public_intelligence", "benchmark"]).eq("score_schema_version", classification.scoreSchemaVersion).eq("analysis_status", "complete").eq("policy_version", classification.policyVersion).eq("ruleset_version", classification.rulesetVersion).eq("scanner_build", classification.scannerBuild).in("decision", ["review", "block"]).order("scanned_at", { ascending: false }).limit(80);
    request = classification.scanIds ? request.in("id", classification.scanIds) : request.is("superseded_at", null);
    const { data: scans, error: scanError } = await request;
    if (scanError) return mirror();
    const rank = (severity: string) => ({ CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }[severity] || 0);
    const latest = new Map<string, Record<string, unknown>>();
    for (const scan of (scans || []) as Array<Record<string, unknown>>) { const key = `${String(scan.extension_id).toLowerCase()}@${scan.version}`; if (!latest.has(key)) latest.set(key, scan); }
    const rows = [...latest.values()].sort((a, b) => rank(String(b.severity)) - rank(String(a.severity)) || String(b.scanned_at).localeCompare(String(a.scanned_at))).slice(0, limit);
    const ids = [...new Set(rows.map((item) => String(item.extension_id)))];
    const { data: extensions, error: extensionError } = ids.length ? await db.from("extensions").select("id,display_name").in("id", ids) : { data: [] as Array<{ id: string; display_name: string }>, error: null };
    if (extensionError) return mirror();
    const names = new Map((extensions || []).map((item) => [String(item.id), String(item.display_name)]));
    return rows.map((item) => ({ scan_id: String(item.id), extension_id: String(item.extension_id), version: String(item.version), display_name: names.get(String(item.extension_id)) || String(item.extension_id), severity: String(item.severity || "INFO"), decision: normalizeDecision(item.decision), public_outcome: String(item.public_outcome || legacyPublicOutcome(item)), decision_basis: String(item.decision_basis || "legacy_scanner_result"), evidence_confidence: String(item.evidence_confidence || "none"), scanned_at: String(item.scanned_at), coverage_percent: Number(item.coverage_percent || 0), decision_reason: String(item.decision_reason || "Open the exact artifact evidence.") }));
  } catch {
    return mirror();
  }
}

/** Current-policy reproducible scans only. Development and private work never enter this catalog. */
async function fetchPublicInventory(limit = 240, offset = 0): Promise<PublicInventory> {
  // Public pages should use the compact D1 publication mirror first. It is
  // already bounded and immutable between imports, while the Supabase query
  // below remains the compatibility path for local/legacy deployments.
  const cloudflareInventory = await getCloudflareRegistrySection<PublicInventory>("inventory");
  if (cloudflareInventory?.items && cloudflareInventory.totals && hasAccuracyGateAttestation(cloudflareInventory.publication)) {
    return {
      ...cloudflareInventory,
      items: cloudflareInventory.items.slice(offset, offset + limit),
    };
  }
  const mirror = async () => {
    const inventory = (await getPublicRegistrySnapshot())?.inventory;
    return inventory && hasAccuracyGateAttestation(inventory.publication)
      ? { ...inventory, items: inventory.items.slice(offset, offset + limit) }
      : emptyInventory();
  };
  const db = publicDb();
  if (!db) return mirror();
  try {
    const classification = await activePublicClassification(db);
    if (!classification || !classification.scanIds || classification.scanIds.length === 0) return mirror();
    let request = db.from("scans").select("id,extension_id,version,artifact_sha256,severity,decision,decision_reason,public_outcome,decision_basis,evidence_confidence,provenance_tier,expected_profile_id,capability_assessment,score_schema_version,risk_score,malware_score,coverage_percent,scanner_build,ruleset_version,scanned_at").in("scan_purpose", ["public_intelligence", "benchmark"]).eq("score_schema_version", classification.scoreSchemaVersion).eq("analysis_status", "complete").eq("policy_version", classification.policyVersion).eq("ruleset_version", classification.rulesetVersion).eq("scanner_build", classification.scannerBuild).in("decision", ["allow", "review", "block"]).order("scanned_at", { ascending: false }).limit(Math.min(offset + limit, 10000));
    request = classification.scanIds ? request.in("id", classification.scanIds) : request.is("superseded_at", null);
    const { data: scans, error } = await request;
    if (error || !scans?.length) return mirror();
    const latest = new Map<string, (typeof scans)[number]>();
    for (const scan of scans) {
      const key = `${String(scan.extension_id).toLowerCase()}@${scan.version}`;
      if (!latest.has(key)) latest.set(key, scan);
    }
    const selectedScans = [...latest.values()].slice(offset, offset + limit);
    const ids = [...new Set(selectedScans.map((row) => String(row.extension_id)))];
    const { data: stored, error: storedError } = await db.from("extensions").select("id,display_name,publisher,description,icon_url,publisher_verified").in("id", ids);
    if (storedError) return mirror();
    const metadata = new Map((stored || []).map((item) => [String(item.id), item]));
    const items: PublicInventoryItem[] = selectedScans.map((row) => {
      const extension = metadata.get(String(row.extension_id));
      const assessment = objectValue(row.capability_assessment);
      const matched = Array.isArray(assessment.matched) ? assessment.matched.map(String) : [];
      return {
        scan_id: String(row.id), extension_id: String(row.extension_id), version: String(row.version), artifact_sha256: String(row.artifact_sha256),
        display_name: String(extension?.display_name || row.extension_id), publisher: String(extension?.publisher || String(row.extension_id).split(".")[0]),
        description: matched.length ? `Expected: ${matched.map(humanize).join(", ")}` : String(row.decision_reason || extension?.description || "Open the exact artifact evidence."),
        icon_url: String(extension?.icon_url || ""), publisher_verified: Boolean(extension?.publisher_verified), severity: String(row.severity || "INFO"),
        decision: normalizeDecision(row.decision), public_outcome: String(row.public_outcome || legacyPublicOutcome(row)), decision_basis: String(row.decision_basis || "legacy_scanner_result"),
        evidence_confidence: String(row.evidence_confidence || "none"), provenance_tier: String(row.provenance_tier || "unknown"), expected_profile_id: String(row.expected_profile_id || ""), capability_assessment: assessment,
        scanned_at: String(row.scanned_at), coverage_percent: Number(row.coverage_percent || 0), decision_reason: String(row.decision_reason || "Open the exact artifact evidence."),
        risk_score: Number(row.risk_score || 0), malware_score: Number(row.malware_score || 0), scanner_build: String(row.scanner_build || "unknown"), ruleset_version: String(row.ruleset_version || "unknown"), score_schema_version: String(row.score_schema_version || "1"),
      };
    });
    return { items, totals: { extensions: new Set(items.map((item) => item.extension_id)).size, releases: items.length, complete: items.filter((item) => item.public_outcome !== "incomplete").length, allowed: items.filter((item) => item.decision === "allow").length, expected: items.filter((item) => item.public_outcome === "expected_capability").length, investigate: items.filter((item) => item.public_outcome === "investigate").length, review: items.filter((item) => item.decision === "review").length, blocked: items.filter((item) => item.decision === "block").length, lastScannedAt: items[0]?.scanned_at || null } };
  } catch {
    return mirror();
  }
}

async function fetchPublicAnalysisHistory(limit = 24, offset = 0): Promise<PublicAnalysisHistory> {
  const mirror = async () => {
    const history = (await getPublicRegistrySnapshot())?.history || [];
    return summarizeAnalysisHistory(history.slice(offset, offset + limit), history.length, history);
  };
  const db = publicDb();
  if (!db) return mirror();
  try {
    const classification = await activePublicClassification(db);
    if (!classification || !classification.scanIds || classification.scanIds.length === 0) return mirror();
    const { data, error } = await db.from("scans")
      .select("id,extension_id,version,artifact_sha256,severity,decision,decision_reason,public_outcome,decision_basis,evidence_confidence,provenance_tier,expected_profile_id,capability_assessment,score_schema_version,risk_score,malware_score,coverage_percent,scanner_build,ruleset_version,scanned_at")
      .in("scan_purpose", ["public_intelligence", "benchmark"])
      .in("analysis_status", ["complete", "incomplete"])
      .eq("policy_version", classification.policyVersion)
      .eq("ruleset_version", classification.rulesetVersion)
      .eq("score_schema_version", classification.scoreSchemaVersion)
      .eq("scanner_build", classification.scannerBuild)
      .in("id", classification.scanIds)
      .order("scanned_at", { ascending: false })
      .limit(1000);
    if (error || !data?.length) return mirror();
    const rows = latestByExactArtifact((data || []) as Array<Record<string, unknown>>);
    const ids = [...new Set(rows.map((row) => String(row.extension_id)))];
    const { data: stored, error: storedError } = ids.length
      ? await db.from("extensions").select("id,display_name,publisher,description,icon_url,publisher_verified").in("id", ids)
      : { data: [], error: null };
    if (storedError) return mirror();
    const metadata = new Map((stored || []).map((item) => [String(item.id), item as Record<string, unknown>]));
    const items = rows.map((row) => inventoryItemFromRow(row, metadata.get(String(row.extension_id))));
    return summarizeAnalysisHistory(items.slice(offset, offset + limit), items.length, items);
  } catch {
    return mirror();
  }
}

function summarizeAnalysisHistory(items: PublicInventoryItem[], total = items.length, allItems = items): PublicAnalysisHistory {
  return { items, total, complete: allItems.filter((item) => item.decision !== "incomplete").length, pending: allItems.filter((item) => item.decision === "incomplete").length };
}

function inventoryItemFromRow(row: Record<string, unknown>, extension?: Record<string, unknown>): PublicInventoryItem {
  const assessment = objectValue(row.capability_assessment);
  const matched = Array.isArray(assessment.matched) ? assessment.matched.map(String) : [];
  return {
    scan_id: String(row.id), extension_id: String(row.extension_id), version: String(row.version), artifact_sha256: String(row.artifact_sha256 || ""),
    display_name: String(extension?.display_name || row.extension_id), publisher: String(extension?.publisher || String(row.extension_id).split(".")[0]),
    description: matched.length ? `Expected: ${matched.map(humanize).join(", ")}` : String(row.decision_reason || extension?.description || "Open the exact artifact evidence."),
    icon_url: String(extension?.icon_url || ""), publisher_verified: Boolean(extension?.publisher_verified), severity: String(row.severity || "INFO"),
    decision: normalizeDecision(row.decision), public_outcome: String(row.public_outcome || legacyPublicOutcome(row)), decision_basis: String(row.decision_basis || "legacy_scanner_result"),
    evidence_confidence: String(row.evidence_confidence || "none"), provenance_tier: String(row.provenance_tier || "unknown"), expected_profile_id: String(row.expected_profile_id || ""), capability_assessment: assessment,
    scanned_at: String(row.scanned_at), coverage_percent: Number(row.coverage_percent || 0), decision_reason: String(row.decision_reason || "Open the exact artifact evidence."),
    risk_score: Number(row.risk_score || 0), malware_score: Number(row.malware_score || 0), scanner_build: String(row.scanner_build || "unknown"), ruleset_version: String(row.ruleset_version || "unknown"), score_schema_version: String(row.score_schema_version || "1"),
  };
}

async function fetchCatalog(query = "", limit = 50): Promise<CatalogExtension[]> {
  const db = publicDb();
  if (db) {
    let request = db.from("extensions").select("*, extension_versions(version,is_latest,latest_scan_id,scan_state)").order("catalog_rank", { ascending: true, nullsFirst: false }).limit(Math.min(limit, 100));
    if (query.trim()) request = request.or(`id.ilike.%${escapeFilter(query)}%,display_name.ilike.%${escapeFilter(query)}%,publisher.ilike.%${escapeFilter(query)}%`);
    const { data, error } = await request;
    if (!error && data?.length) return data.map((row) => normalizeCatalogRow(row as Record<string, unknown>));
  }
  const snapshot = await getPublicRegistrySnapshot();
  if (snapshot) {
    const needle = query.trim().toLowerCase();
    return snapshot.catalog.filter((item) => !needle || [item.id, item.display_name, item.publisher].some((value) => value.toLowerCase().includes(needle))).slice(0, Math.min(limit, 100));
  }
  if (!query.trim()) return [];
  const registry = await searchMarketplace(query, limit);
  return registry.map((item, index) => ({ id: item.extension_id, name: item.extension_id.split(".").slice(1).join("."), display_name: item.display_name, publisher: item.publisher, description: item.short_description, registry: item.registry || "vs-marketplace", publisher_verified: item.publisher_verified, installs: item.install_count, rating: item.rating_average, icon_url: item.icon_url, repository_url: "", last_published_at: item.last_updated || null, catalog_rank: index + 1, latest_version: item.version, latest_scan: null }));
}

export async function getExtensionProduct(id: string, client?: SupabaseClient): Promise<{ extension: CatalogExtension; versions: Array<Record<string, unknown>>; scan: Record<string, unknown> | null } | null> {
  const cloudflareProduct = await getPublicRegistryProduct(id);
  if (cloudflareProduct?.extension) {
    const latestVersion = String(cloudflareProduct.extension.latest_version || cloudflareProduct.versions.find((item) => item.is_latest)?.version || "");
    const latestD1Scan = cloudflarePrivateAvailable()
      ? await getCloudflareScanSummary(id, latestVersion).catch(() => null)
      : null;
    if (!latestD1Scan?.scan) {
      return {
        extension: cloudflareProduct.extension,
        versions: cloudflareProduct.versions,
        scan: cloudflareProduct.scans.find((item) => item.version === latestVersion)?.scan || null,
      };
    }
    const scan = latestD1Scan.scan as Record<string, unknown>;
    const versions = cloudflareProduct.versions.map((item) => String(item.version || "") === latestVersion
      ? { ...item, latest_scan_id: scan.id, scan_state: scan.analysis_status, decision: scan.decision, coverage_percent: scan.coverage_percent, scanned_at: scan.scanned_at }
      : item);
    return { ...cloudflareProduct, extension: { ...cloudflareProduct.extension, latest_scan: scan }, versions, scan };
  }
  const cloudflareCatalog = await getCloudflareRegistryCatalogExtension<Record<string, unknown>>(id);
  if (cloudflareCatalog) {
    const versions = await cachedVersions(id).catch(() => []);
    const fallbackVersions = versions.length
      ? versions
      : [{ extension_id: id, version: String(cloudflareCatalog.latest_version || ""), registry: String(cloudflareCatalog.registry || "vs-marketplace"), is_latest: true, scan_state: "not_scanned" }];
    return {
      extension: normalizeCatalogRow({ ...cloudflareCatalog, extension_versions: fallbackVersions }),
      versions: limitVersionHistory(dedupeVersions(fallbackVersions)),
      scan: null,
    };
  }
  const db = client || publicDb();
  if (db) {
    try {
      const storedId = await resolveStoredExtensionId(db, id);
      if (storedId) {
        const [{ data: extension }, { data: versions }] = await Promise.all([
          db.from("extensions").select("*").eq("id", storedId).maybeSingle(),
          db.from("extension_versions").select("*").eq("extension_id", storedId).order("published_at", { ascending: false, nullsFirst: false }),
        ]);
        if (extension) {
          let versionRows = versions || [];
          if (versionRows.length <= 1) {
            const registryVersions = await cachedVersions(storedId).catch(() => []);
            const persisted = new Map(versionRows.map((item) => [String(item.version), item]));
            versionRows = registryVersions.map((item) => ({ ...item, ...(persisted.get(item.version) || {}) }));
            if (!versionRows.length) versionRows = versions || [];
          }
          versionRows = limitVersionHistory(dedupeVersions(versionRows));
          const latest = versionRows.find((item) => item.is_latest) || versionRows[0];
          let scan: Record<string, unknown> | null = null;
          if (versionRows.length) {
            const scansByVersion = await getVisibleScansByVersion(db, storedId);
            versionRows = versionRows.map((item) => {
              const versionScan = scansByVersion.get(String(item.version));
              return {
                ...item,
                latest_scan_id: versionScan?.id || null,
                scan_state: versionScan ? String(versionScan.analysis_status || "complete") : "not_scanned",
                decision: versionScan?.decision || null,
                coverage_percent: versionScan?.coverage_percent ?? null,
                scanned_at: versionScan?.scanned_at || null,
              };
            });
            scan = scansByVersion.get(String(latest?.version || "")) || null;
          }
          return { extension: normalizeCatalogRow(extension as Record<string, unknown>), versions: dedupeVersions(versionRows), scan };
        }
      }
    } catch {
      // The public mirror is used while Supabase REST is restricted.
    }
  }
  const mirrored = await mirroredExtensionProduct(id);
  if (mirrored) return mirrored;
  return registryProduct(id);
}

async function registryProduct(id: string): Promise<{ extension: CatalogExtension; versions: Array<Record<string, unknown>>; scan: Record<string, unknown> | null } | null> {
  try {
    const item = await resolveMarketplaceExtension(id);
    const versions = limitVersionHistory(await cachedVersions(item.extension_id));
    return { extension: { id: item.extension_id, name: item.extension_id.split(".").slice(1).join("."), display_name: item.display_name, publisher: item.publisher, description: item.short_description, registry: item.registry || "vs-marketplace", publisher_verified: item.publisher_verified, installs: item.install_count, rating: item.rating_average, icon_url: item.icon_url, repository_url: "", last_published_at: item.last_updated || null, catalog_rank: null, latest_version: item.version, latest_scan: null }, versions: versions.length ? versions : [{ extension_id: item.extension_id, version: item.version, registry: item.registry, published_at: item.last_updated, is_latest: true, scan_state: "not_scanned" }], scan: null };
  } catch {
    return null;
  }
}

export async function getVersionProduct(id: string, version: string, client?: SupabaseClient): Promise<Record<string, unknown> | null> {
  // Version pages only need the exact release summary. Parsing the complete
  // report here duplicates work with the immutable report route and can push
  // a large VSIX report over Cloudflare Worker's CPU limit. The full report is
  // intentionally reserved for getVersionScanProduct below.
  const d1Summary = cloudflarePrivateAvailable()
    ? await getCloudflareScanSummary(id, version).catch(() => null)
    : null;
  if (d1Summary) {
    return {
      version: {
        extension_id: id,
        version,
        latest_scan_id: d1Summary.id,
        scan_state: d1Summary.analysis_status,
      },
      scan: d1Summary,
      findings: [],
      files: [],
      dependencies: [],
    };
  }
  const cloudflareProduct = await getPublicRegistryProduct(id);
  const cloudflareVersions = cloudflareProduct?.versions || (await getCloudflareRegistryCatalogExtension<Record<string, unknown>>(id) ? await cachedVersions(id).catch(() => []) : []);
  if (cloudflareVersions.length) {
    const versionRow = cloudflareVersions.find((item) => String(item.version || "") === version);
    if (!versionRow) return null;
    const scan = cloudflareProduct?.scans?.find((item) => String(item.version || "") === version);
    return { version: versionRow, scan: scan?.scan || null, findings: scan?.findings || [], files: scan?.files || [], dependencies: scan?.dependencies || [] };
  }
  const db = client || publicDb();
  if (!db) return null;
  try {
    const storedId = await resolveStoredExtensionId(db, id);
    if (storedId) {
      const { data: versionRow } = await db.from("extension_versions").select("*").eq("extension_id", storedId).eq("version", version).maybeSingle();
      if (versionRow) {
        const scan = (await getVisibleScansByVersion(db, storedId, version)).get(version);
        const visibleVersion = {
          ...versionRow,
          latest_scan_id: scan?.id || null,
          scan_state: scan ? String(scan.analysis_status || "complete") : "not_scanned",
        };
        if (!scan?.id) return { version: visibleVersion, scan: null, findings: [], files: [], dependencies: [] };
        return loadVersionScan(db, storedId, version, String(scan.id), visibleVersion);
      }
    }
  } catch {
    // Fall through to the read-only mirror.
  }
  return mirroredVersionProduct(id, version);
}

export type VersionScanProductOptions = {
  compact?: boolean;
  includePreviews?: boolean;
  skipCloudflareCatalog?: boolean;
};

export async function getVersionScanProduct(id: string, version: string, scanId: string, client?: SupabaseClient, options: VersionScanProductOptions = {}): Promise<Record<string, unknown> | null> {
  const cloudflareReport = await getCloudflareScanProduct(id, version, scanId, true).catch(() => null);
  if (cloudflareReport) return cloudflareReport;
  const cloudflareProduct = await getPublicRegistryProduct(id);
  if (cloudflareProduct) {
    const scan = cloudflareProduct.scans?.find((item) => String(item.version || "") === version && String(item.scan?.id || "") === scanId);
    if (scan) {
      // The registry snapshot is the public authorization boundary for an
      // immutable report. If the active private publication has rotated, try
      // the exact stored report once more without the active-release join,
      // then serve the attested compact snapshot rather than a misleading
      // 404. The scan ID must match the public product before this fallback
      // can expose anything.
      const storedReport = await getCloudflareScanProduct(id, version, scanId, false).catch(() => null);
      if (storedReport) return storedReport;
      return {
        version: cloudflareProduct.versions?.find((item) => String(item.version || "") === version) || { extension_id: id, version },
        scan: scan.scan,
        findings: scan.findings || [],
        files: scan.files || [],
        dependencies: scan.dependencies || [],
      };
    }
    if (cloudflareProduct.detail_state !== "summary_only") return null;
  }
  if (!options.skipCloudflareCatalog && await getCloudflareRegistryCatalogExtension<Record<string, unknown>>(id)) return null;
  const db = client || publicDb();
  if (!db) return null;
  try {
    const storedId = await resolveStoredExtensionId(db, id);
    if (storedId) {
      const { data: versionRow } = await db.from("extension_versions").select("*").eq("extension_id", storedId).eq("version", version).maybeSingle();
      if (versionRow) {
        // The immutable public route must not turn an arbitrary scan ID into
        // a report. Resolve the exact version through attested publication
        // membership (or the caller's RLS-protected owned scan) first.
        const visible = await getVisibleScansByVersion(db, storedId, version);
        const visibleScan = visible.get(version);
        if (!visibleScan || String(visibleScan.id || "") !== scanId) return null;
        return loadVersionScan(db, storedId, version, scanId, versionRow, options);
      }
    }
  } catch {
    // Fall through to the read-only mirror.
  }
  return mirroredScanProduct(id, version, scanId);
}

async function loadVersionScan(db: SupabaseClient, id: string, version: string, scanId: string, versionRow: Record<string, unknown>, options: VersionScanProductOptions = {}): Promise<Record<string, unknown> | null> {
  const scanSelect = options.compact
    ? "id,extension_id,version,artifact_sha256,profile,schema_version,scanner_version,ruleset_version,analysis_status,decision,decision_reason,public_outcome,decision_basis,evidence_confidence,provenance_tier,expected_profile_id,scanner_build,severity,coverage_percent,capability_assessment,capabilities,security_dimensions,manifest,baseline_diff,scanned_at"
    : "*";
  const findingsSelect = options.compact
    ? "id,rule_id,category,severity,confidence,evidence_class,actionability,summary,recommendation,file_refs"
    : "*";
  const filesSelect = options.compact ? "path,size_bytes,kind" : "path,sha256,size_bytes";
  const previewsRequest = options.includePreviews === false
    ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
    : db.from("artifact_file_previews").select("path,content_sha256,truncated").eq("scan_id", scanId);
  const [scan, findings, files, dependencies, previews] = await Promise.all([
    db.from("scans").select(scanSelect).eq("id", scanId).eq("extension_id", id).eq("version", version).maybeSingle(),
    db.from("findings").select(findingsSelect).eq("scan_id", scanId).order("severity"),
    db.from("artifact_files").select(filesSelect).eq("scan_id", scanId).order("path").limit(5000),
    db.from("dependencies").select("name,version,ecosystem,relationship,advisories").eq("scan_id", scanId).order("relationship").order("name"),
    previewsRequest,
  ]);
  if (!scan.data) return null;
  const available = new Map((previews.data || []).map((item) => [String(item.path), item]));
  const fileRows = (files.data || []).map((item) => ({ ...item, preview_available: available.has(String(item.path)), preview: available.get(String(item.path)) || null }));
  return { version: versionRow, scan: scan.data, findings: findings.data || [], files: fileRows, dependencies: dependencies.data || [] };
}

async function mirroredExtensionProduct(id: string): Promise<{ extension: CatalogExtension; versions: Array<Record<string, unknown>>; scan: Record<string, unknown> | null } | null> {
  const product = await getPublicRegistryProduct(id);
  if (!product) return null;
  const latest = product.versions.find((item) => item.is_latest) || product.versions[0];
  const scan = product.scans.find((item) => item.version === String(latest?.version || ""))?.scan || null;
  return { extension: product.extension, versions: product.versions, scan };
}

async function mirroredVersionProduct(id: string, version: string): Promise<Record<string, unknown> | null> {
  const product = await getPublicRegistryProduct(id);
  if (!product) return null;
  const versionRow = product.versions.find((item) => String(item.version) === version);
  if (!versionRow) return null;
  const scan = product.scans.find((item) => item.version === version);
  return {
    version: versionRow,
    scan: scan?.scan || null,
    findings: scan?.findings || [],
    files: scan?.files || [],
    dependencies: scan?.dependencies || [],
  };
}

async function mirroredScanProduct(id: string, version: string, scanId: string): Promise<Record<string, unknown> | null> {
  const product = await getPublicRegistryProduct(id);
  if (!product || product.detail_state === "summary_only") return null;
  const versionRow = product.versions.find((item) => String(item.version) === version);
  const scan = product.scans.find((item) => item.version === version && String(item.scan.id) === scanId);
  if (!versionRow || !scan) return null;
  return { version: versionRow, scan: scan.scan, findings: scan.findings, files: scan.files, dependencies: scan.dependencies };
}

export async function seedExtensionFromRegistry(id: string): Promise<CatalogExtension> {
  const item = await resolveMarketplaceExtension(id);
  const db = serviceDb();
  const extension = { id: item.extension_id, name: item.extension_id.split(".").slice(1).join("."), display_name: item.display_name, publisher: item.publisher, description: item.short_description, registry: item.registry || "vs-marketplace", publisher_verified: item.publisher_verified, installs: item.install_count, rating: item.rating_average, icon_url: item.icon_url, last_published_at: item.last_updated || null, updated_at: new Date().toISOString() };
  const { error } = await db.from("extensions").upsert(extension, { onConflict: "id" });
  if (error) throw error;
  await db.from("extension_versions").upsert({ extension_id: item.extension_id, version: item.version, registry: item.registry || "vs-marketplace", published_at: item.last_updated || null, download_url: item.download_url || null, is_latest: true }, { onConflict: "extension_id,version" });
  return { ...extension, repository_url: "", catalog_rank: null, latest_version: item.version, latest_scan: null };
}

function normalizeCatalogRow(row: Record<string, unknown>): CatalogExtension {
  const versions = Array.isArray(row.extension_versions) ? row.extension_versions as Array<Record<string, unknown>> : [];
  const latest = versions.find((item) => item.is_latest) || versions[0];
  return { id: String(row.id), name: String(row.name), display_name: String(row.display_name), publisher: String(row.publisher), description: String(row.description || ""), registry: String(row.registry), publisher_verified: Boolean(row.publisher_verified), installs: Number(row.installs || 0), rating: Number(row.rating || 0), icon_url: String(row.icon_url || ""), repository_url: String(row.repository_url || ""), last_published_at: row.last_published_at ? String(row.last_published_at) : null, catalog_rank: row.catalog_rank == null ? null : Number(row.catalog_rank), latest_version: latest ? String(latest.version || "") : undefined, latest_scan: null };
}

function escapeFilter(value: string): string {
  return value.replace(/[,%()]/g, " ").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function legacyPublicOutcome(row: Record<string, unknown>): string {
  const decision = String(row.decision || "incomplete");
  if (decision === "allow") return "clear";
  if (decision === "review") return "investigate";
  if (decision === "block") return String(row.verdict || "") === "malicious" ? "confirmed_threat" : "preventive_block";
  return "incomplete";
}

function normalizeDecision(value: unknown): ScanDecision {
  const decision = String(value || "incomplete");
  return decision === "allow" || decision === "review" || decision === "block" ? decision : "incomplete";
}

function humanize(value: string): string { return value.replaceAll("_", " "); }

async function resolveStoredExtensionId(db: SupabaseClient, id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(id)) return null;
  const result = await db.from("extensions").select("id").ilike("id", id).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id ? String(result.data.id) : null;
}

function dedupeVersions(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...new Map(rows.filter((row) => isConcreteVersion(String(row.version || ""))).map((row) => [String(row.version), row])).values()];
}

function limitVersionHistory<T>(rows: T[]): T[] {
  const latest = rows.find((row) => Boolean((row as { is_latest?: unknown }).is_latest));
  const visible = rows.slice(0, MAX_RENDERED_VERSION_HISTORY);
  if (latest && !visible.includes(latest)) visible.unshift(latest);
  return visible;
}

function latestByExactArtifact(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = `${String(row.extension_id || "").toLowerCase()}@${String(row.version || "")}@${String(row.artifact_sha256 || "").toLowerCase()}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

async function activePublicClassification(
  db: SupabaseClient,
): Promise<PublicClassification | null> {
  const result = await db.from("scan_publication_releases").select("id,policy_version,ruleset_version,score_schema_version,scanner_build,accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256").eq("active", true).limit(1).maybeSingle();
  // A release without a signed accuracy-gate attestation is not a public
  // classification. Legacy dominant-policy fallback is intentionally gone:
  // missing migrations or stale releases must render no public cohort.
  if (result.error || !result.data || !hasAccuracyGateAttestation(result.data)) return null;
  if (!result.data.policy_version || !result.data.ruleset_version || !result.data.score_schema_version || !result.data.scanner_build) return null;
  const members = await db.from("scan_publication_release_scans").select("scan_id").eq("release_id", result.data.id);
  if (members.error) return null;
  return {
    policyVersion: String(result.data.policy_version),
    rulesetVersion: String(result.data.ruleset_version),
    scoreSchemaVersion: String(result.data.score_schema_version),
    scannerBuild: String(result.data.scanner_build),
    scanIds: (members.data || []).map((row) => String(row.scan_id)).filter(Boolean),
  };
}

type PublicClassification = {
  policyVersion: string;
  rulesetVersion: string;
  scoreSchemaVersion: string;
  scannerBuild: string;
  scanIds: string[] | null;
};

export async function getVisibleScansByVersion(
  db: SupabaseClient,
  extensionId: string,
  version?: string,
): Promise<Map<string, Record<string, unknown>>> {
  const classification = await activePublicClassification(db);
  const publicRequest = classification && classification.scanIds?.length !== 0
    ? applyVersionFilter(
      db.from("scans")
        .select("*")
        .eq("extension_id", extensionId)
        .in("scan_purpose", ["public_intelligence", "benchmark"])
        .eq("analysis_status", "complete")
        .eq("policy_version", classification.policyVersion)
        .eq("ruleset_version", classification.rulesetVersion)
        .eq("score_schema_version", classification.scoreSchemaVersion)
        .eq("scanner_build", classification.scannerBuild)
        .order("scanned_at", { ascending: false })
        .limit(5000),
      version,
    )
    : null;
  const releaseRequest = publicRequest && classification?.scanIds
    ? publicRequest.in("id", classification.scanIds)
    : publicRequest?.is("superseded_at", null) || null;
  let ownRequest = db.from("scan_job_results")
    .select("linked_at,scan:scans!inner(*)")
    .eq("scan.extension_id", extensionId)
    .order("linked_at", { ascending: false })
    .limit(5000);
  if (version) ownRequest = ownRequest.eq("scan.version", version);
  const [published, ownedLinks] = await Promise.all([
    releaseRequest || Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ownRequest,
  ]);
  if (published.error) throw published.error;
  if (ownedLinks.error && !isMissingScanJobResultsTable(ownedLinks.error)) throw ownedLinks.error;
  const owned = (ownedLinks.data || [])
    .flatMap((row) => Array.isArray(row.scan) ? row.scan : [row.scan])
    .filter((row) => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    .map((row) => row as Record<string, unknown>);
  return selectVisibleScans(
    (published.data || []) as Record<string, unknown>[],
    owned,
  );
}

export function selectVisibleScans(
  published: Record<string, unknown>[],
  owned: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const selected = new Map<string, Record<string, unknown>>();
  // A signed-in user's own exact scan takes precedence. RLS makes the owned
  // query empty for anonymous users and for scans requested by anyone else.
  for (const row of [...owned, ...published]) {
    const rowVersion = String(row.version || "");
    if (rowVersion && !selected.has(rowVersion)) selected.set(rowVersion, row);
  }
  return selected;
}

function applyVersionFilter<T extends { eq(column: string, value: string): T }>(
  request: T,
  version?: string,
): T {
  return version ? request.eq("version", version) : request;
}

type ClassificationRow = {
  extension_id?: unknown;
  version?: unknown;
  policy_version?: unknown;
  ruleset_version?: unknown;
  score_schema_version?: unknown;
  scanner_build?: unknown;
  scanned_at?: unknown;
};

export function dominantPublicClassification(
  rows: ClassificationRow[],
): { policyVersion: string; rulesetVersion: string; scoreSchemaVersion: string; scannerBuild: string } | null {
  const candidates = new Map<string, {
    policyVersion: string;
    rulesetVersion: string;
    scoreSchemaVersion: string;
    scannerBuild: string;
    artifacts: Set<string>;
    latestScan: string;
  }>();
  for (const row of rows) {
    const policyVersion = String(row.policy_version || "");
    const rulesetVersion = String(row.ruleset_version || "");
    const scoreSchemaVersion = String(row.score_schema_version || "");
    const scannerBuild = String(row.scanner_build || "");
    const extensionId = String(row.extension_id || "").toLowerCase();
    const version = String(row.version || "");
    if (!extensionId || !version || !scoreSchemaVersion || !/^[0-9a-f]{40}$/.test(scannerBuild) || !policyVersion || policyVersion === "legacy" || !rulesetVersion || rulesetVersion === "unknown") continue;
    const key = `${policyVersion}\u0000${rulesetVersion}\u0000${scoreSchemaVersion}\u0000${scannerBuild}`;
    const candidate = candidates.get(key) || {
      policyVersion,
      rulesetVersion,
      scoreSchemaVersion,
      scannerBuild,
      artifacts: new Set<string>(),
      latestScan: "",
    };
    candidate.artifacts.add(`${extensionId}@${version}`);
    candidate.latestScan = [candidate.latestScan, String(row.scanned_at || "")].sort().at(-1) || "";
    candidates.set(key, candidate);
  }
  const selected = [...candidates.values()].sort((left, right) =>
    right.artifacts.size - left.artifacts.size
    || right.latestScan.localeCompare(left.latestScan)
    || left.policyVersion.localeCompare(right.policyVersion)
    || left.rulesetVersion.localeCompare(right.rulesetVersion)
    || left.scoreSchemaVersion.localeCompare(right.scoreSchemaVersion)
    || left.scannerBuild.localeCompare(right.scannerBuild)
  )[0];
  return selected ? {
    policyVersion: selected.policyVersion,
    rulesetVersion: selected.rulesetVersion,
    scoreSchemaVersion: selected.scoreSchemaVersion,
    scannerBuild: selected.scannerBuild,
  } : null;
}

function isMissingScanJobResultsTable(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205"
    && String(error.message || "").includes("scan_job_results");
}

export type BadgeDecision = {
  found: boolean;
  extension_id: string | null;
  version: string | null;
  decision: "allow" | "review" | "block" | null;
  verdict: string | null;
  public_outcome: string | null;
  analysis_status: string;
  capability_assessment: Record<string, unknown>;
  analysis_coverage: Record<string, unknown>;
  risk_score: number | null;
  malware_score: number | null;
  scanned_at: string | null;
};

const emptyBadgeDecision = (found = false): BadgeDecision => ({
  found,
  extension_id: null,
  version: null,
  decision: null,
  verdict: null,
  public_outcome: null,
  analysis_status: "incomplete",
  capability_assessment: {},
  analysis_coverage: {},
  risk_score: null,
  malware_score: null,
  scanned_at: null,
});

const cachedBadgeDecision=unstable_cache(async(id:string)=>fetchBadgeDecision(id, null),["public-badge-v3"],{revalidate:300,tags:["public-intel"]});
const cachedVersionBadgeDecision=unstable_cache(async(id:string,version:string)=>fetchBadgeDecision(id, version),["public-badge-version-v1"],{revalidate:300,tags:["public-intel"]});

export function getBadgeDecision(id: string): Promise<BadgeDecision> { return cachedBadgeDecision(id.toLowerCase()); }

/** Exact-version badge lookup; the seal is pinned to the analyzed artifact. */
export function getVersionBadgeDecision(id: string, version: string): Promise<BadgeDecision> {
  const normalized = version.replace(/^v/, "").trim();
  if (!normalized) return getBadgeDecision(id);
  return cachedVersionBadgeDecision(id.toLowerCase(), normalized);
}

async function fetchBadgeDecision(rawId: string, version: string | null): Promise<BadgeDecision> {
  const mirror = async () => mirroredBadgeDecision(rawId, version);
  if (cloudflarePrivateAvailable()) {
    try {
      const product = await getCloudflareRegistryProduct<{ extension?: Record<string, unknown>; versions?: Array<Record<string, unknown>> }>(rawId);
      const catalogFallback = product?.extension
        ? null
        : await getCloudflareRegistryCatalogExtension<{ latest_version?: unknown }>(rawId);
      const targetVersion = version || String(product?.extension?.latest_version || product?.versions?.find((item) => item.is_latest)?.version || product?.versions?.[0]?.version || catalogFallback?.latest_version || "");
      if (targetVersion) {
        const scan = await getCloudflareScanSummary(rawId, targetVersion);
        if (scan) return badgeDecisionFromScan(rawId, scan, targetVersion);
      }
    } catch {
      // Continue to the public Supabase/snapshot compatibility paths below.
    }
  }
  const db = publicDb();
  if (!db) return mirror();
  try {
    const storedId = await resolveStoredExtensionId(db, rawId);
    if (!storedId) return mirror();
    const classification = await activePublicClassification(db).catch(() => null);
    if (!classification || !classification.scanIds || classification.scanIds.length === 0) return mirror();
    let request = db.from("scans").select("id,extension_id,version,decision,verdict,public_outcome,analysis_status,analysis_coverage,capability_assessment,risk_score,malware_score,scanned_at")
      .eq("extension_id", storedId)
      .in("scan_purpose", ["public_intelligence", "benchmark"])
      .eq("analysis_status", "complete")
      .eq("policy_version", classification.policyVersion)
      .eq("ruleset_version", classification.rulesetVersion)
      .eq("score_schema_version", classification.scoreSchemaVersion)
      .eq("scanner_build", classification.scannerBuild)
      .in("id", classification.scanIds)
      .order("scanned_at", { ascending: false })
      .limit(1);
    if (version) request = request.eq("version", version);
    if (classification?.scanIds) request = request.in("id", classification.scanIds);
    const { data, error } = await request;
    if (error) return mirror();
    const row = (data || [])[0] as Record<string, unknown> | undefined;
    if (!row) return { ...emptyBadgeDecision(true), extension_id: storedId };
    const decision = normalizeDecision(row.decision);
    return {
      found: true,
      extension_id: storedId,
      version: String(row.version || ""),
      decision: decision === "incomplete" ? null : decision,
      verdict: row.verdict ? String(row.verdict) : null,
      public_outcome: row.public_outcome ? String(row.public_outcome) : null,
      analysis_status: String(row.analysis_status || "incomplete"),
      capability_assessment: objectValue(row.capability_assessment),
      analysis_coverage: objectValue(row.analysis_coverage),
      risk_score: numberOrNull(row.risk_score),
      malware_score: numberOrNull(row.malware_score),
      scanned_at: row.scanned_at ? String(row.scanned_at) : null,
    };
  } catch {
    return mirror();
  }
}

async function mirroredBadgeDecision(id: string, version: string | null): Promise<BadgeDecision> {
  const product = await getPublicRegistryProduct(id);
  if (!product) return emptyBadgeDecision();
  const scan = product.scans
    .filter((item) => !version || item.version === version)
    .sort((left, right) => String(right.scan.scanned_at || "").localeCompare(String(left.scan.scanned_at || "")))[0];
  if (!scan) return { ...emptyBadgeDecision(true), extension_id: product.extension.id };
  const row = scan.scan;
  return badgeDecisionFromScan(id, row, String(row.version || scan.version));
}

function badgeDecisionFromScan(id: string, row: Record<string, unknown>, fallbackVersion: string): BadgeDecision {
  const decision = normalizeDecision(row.decision);
  return {
    found: true,
    extension_id: String(row.extension_id || id),
    version: String(row.version || fallbackVersion),
    decision: decision === "incomplete" ? null : decision,
    verdict: row.verdict ? String(row.verdict) : null,
    public_outcome: row.public_outcome ? String(row.public_outcome) : null,
    analysis_status: String(row.analysis_status || "incomplete"),
    capability_assessment: objectValue(row.capability_assessment),
    analysis_coverage: objectValue(row.analysis_coverage),
    risk_score: numberOrNull(row.risk_score),
    malware_score: numberOrNull(row.malware_score),
    scanned_at: row.scanned_at ? String(row.scanned_at) : null,
  };
}


function emptyInventory(): PublicInventory {
  return { items: [], totals: { extensions: 0, releases: 0, complete: 0, allowed: 0, expected: 0, investigate: 0, review: 0, blocked: 0, lastScannedAt: null } };
}

function emptyAnalysisHistory(): PublicAnalysisHistory {
  return { items: [], total: 0, complete: 0, pending: 0 };
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
