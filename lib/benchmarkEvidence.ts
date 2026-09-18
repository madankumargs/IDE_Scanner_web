import { publicDb } from "@/lib/supabase";
import { getPublicRegistrySnapshot } from "@/lib/publicRegistrySnapshot";
import { unstable_cache } from "next/cache";
import { benchmarkRows } from "@/lib/websiteBenchmarkRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAccuracyGateAttestation } from "@/lib/publicationHealth";

export type ReproducibleBenchmarkRow = (typeof benchmarkRows)[number] & {
  scan: null | {
    id: string; public_outcome: string; decision: string; decision_reason: string; artifact_sha256: string;
    scanner_build: string; ruleset_version: string; coverage_percent: number; scanned_at: string; score_schema_version: string;
    severity: string; malware_score: number; risk_score: number;
  };
};

export type ActivePublication = {
  policyVersion: string;
  rulesetVersion: string;
  scoreSchemaVersion: string;
  scannerBuild: string;
  /** null means legacy releases without an immutable member manifest. */
  scanIds: string[] | null;
};

type BenchmarkScan = Record<string, unknown>;

const cachedBenchmark=unstable_cache(async()=>fetchReproducibleBenchmark(),["public-benchmark-v1"],{revalidate:300,tags:["public-intel"]});

export function getReproducibleBenchmark(): Promise<{ rows: ReproducibleBenchmarkRow[]; published: number; awaiting: number }> { return cachedBenchmark(); }

async function fetchReproducibleBenchmark(): Promise<{ rows: ReproducibleBenchmarkRow[]; published: number; awaiting: number }> {
  const mirror = async () => {
    const snapshot = await getPublicRegistrySnapshot();
    if (snapshot?.benchmark) return snapshot.benchmark as { rows: ReproducibleBenchmarkRow[]; published: number; awaiting: number };
    return { rows: benchmarkRows.map((row) => ({ ...row, scan: null })), published: 0, awaiting: benchmarkRows.length };
  };
  const db = publicDb();
  if (!db) return mirror();
  try {
    const release = await activeBenchmarkPublication(db);
    // A benchmark is evidence for a particular published decision system. Never
    // substitute an older report when the current release has not scanned it.
    if (!release || release.scanIds?.length === 0) return mirror();
    const ids = [...new Set(benchmarkRows.map((row) => row.id))];
    const identityFilter = ids.map((id) => `extension_id.ilike.${id}`).join(",");
    let request = db.from("scans").select("id,extension_id,version,artifact_sha256,public_outcome,decision,decision_reason,policy_version,scanner_build,ruleset_version,coverage_percent,scanned_at,score_schema_version,severity,malware_score,risk_score,superseded_at").in("scan_purpose", ["public_intelligence", "benchmark"]).eq("analysis_status", "complete").eq("policy_version", release.policyVersion).eq("ruleset_version", release.rulesetVersion).eq("score_schema_version", release.scoreSchemaVersion).eq("scanner_build", release.scannerBuild).or(identityFilter).order("scanned_at", { ascending: false });
    request = release.scanIds ? request.in("id", release.scanIds) : request.is("superseded_at", null);
    const { data, error } = await request;
    if (error) return mirror();
    const byArtifact = new Map<string, Record<string, unknown>>();
    for (const scan of selectBenchmarkScansForRelease((data || []) as BenchmarkScan[], release)) {
      const key = artifactKey(String(scan.extension_id), String(scan.version), String(scan.artifact_sha256));
      if (!byArtifact.has(key) && Number(scan.coverage_percent) === 100 && String(scan.scanner_build || "") && String(scan.ruleset_version || "")) byArtifact.set(key, scan);
    }
    const rows: ReproducibleBenchmarkRow[] = benchmarkRows.map((row) => {
      const scan = byArtifact.get(artifactKey(row.id, row.version, row.sha256));
      return { ...row, scan: scan ? {
        id: String(scan.id), public_outcome: String(scan.public_outcome || "incomplete"), decision: String(scan.decision || "incomplete"), decision_reason: String(scan.decision_reason || ""), artifact_sha256: String(scan.artifact_sha256),
        scanner_build: String(scan.scanner_build), ruleset_version: String(scan.ruleset_version), coverage_percent: Number(scan.coverage_percent), scanned_at: String(scan.scanned_at), score_schema_version: String(scan.score_schema_version || "1"),
        severity: String(scan.severity || "INFO"), malware_score: Number(scan.malware_score || 0), risk_score: Number(scan.risk_score || 0),
      } : null };
    });
    const published = rows.filter((row) => row.scan).length;
    return { rows, published, awaiting: rows.length - published };
  } catch {
    return mirror();
  }
}

/**
 * Keeps benchmark rendering tied to one immutable public release. Exported so
 * the release boundary stays protected by a lightweight regression test.
 */
export function selectBenchmarkScansForRelease(scans: BenchmarkScan[], release: ActivePublication): BenchmarkScan[] {
  const memberIds = release.scanIds ? new Set(release.scanIds) : null;
  return scans.filter((scan) =>
    String(scan.policy_version || "") === release.policyVersion
    && String(scan.ruleset_version || "") === release.rulesetVersion
    && String(scan.score_schema_version || "") === release.scoreSchemaVersion
    && String(scan.scanner_build || "") === release.scannerBuild
    && (memberIds ? memberIds.has(String(scan.id || "")) : !scan.superseded_at),
  );
}

async function activeBenchmarkPublication(db: SupabaseClient): Promise<ActivePublication | null> {
  const release = await db
    .from("scan_publication_releases")
    .select("id,policy_version,ruleset_version,score_schema_version,scanner_build,accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (release.error || !release.data || !hasAccuracyGateAttestation(release.data) || !release.data.policy_version || !release.data.ruleset_version || !release.data.score_schema_version || !release.data.scanner_build) return null;

  const members = await db.from("scan_publication_release_scans").select("scan_id").eq("release_id", release.data.id);
  if (members.error) return null;
  return {
    policyVersion: String(release.data.policy_version),
    rulesetVersion: String(release.data.ruleset_version),
    scoreSchemaVersion: String(release.data.score_schema_version),
    scannerBuild: String(release.data.scanner_build),
    scanIds: (members.data || []).map((member) => String(member.scan_id)).filter(Boolean),
  };
}

export function immutableScanPath(row: ReproducibleBenchmarkRow): string | null {
  return row.scan ? `/extensions/${encodeURIComponent(row.id)}/versions/${encodeURIComponent(row.version)}/scans/${encodeURIComponent(row.scan.id)}` : null;
}

function artifactKey(id: string, version: string, sha256: string) { return `${id.toLowerCase()}@${version}@${sha256.toLowerCase()}`; }
