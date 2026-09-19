import { publicDb } from "@/lib/supabase";
import { getPublicRegistrySnapshot } from "@/lib/publicRegistrySnapshot";
import { hasAccuracyGateAttestation } from "@/lib/publicationHealth";
import { unstable_cache } from "next/cache";

export type PublicMetrics = {
  as_of: string | null;
  indexed_extensions: number | null;
  exact_releases_indexed: number | null;
  exact_releases_analyzed: number | null;
  analyzer_complete_reports: number | null;
  known_bad_artifacts: number | null;
  block_decisions: number | null;
  high_risk_reviews: number | null;
  freshness: Record<string, string | null>;
  time_to_analysis: { sample_size: number; median_minutes: number | null; p95_minutes: number | null; status: "measured" | "not_measured" };
  definitions: Record<string, string>;
};

const EMPTY: PublicMetrics = {
  as_of: null, indexed_extensions: null, exact_releases_indexed: null, exact_releases_analyzed: null,
  analyzer_complete_reports: null, known_bad_artifacts: null, block_decisions: null, high_risk_reviews: null,
  freshness: { "vs-marketplace": null, openvsx: null },
  time_to_analysis: { sample_size: 0, median_minutes: null, p95_minutes: null, status: "not_measured" },
  definitions: {
    exact_release: "One registry, extension ID, version, and SHA-256 artifact identity.",
    analyzer_complete: "A latest operational report with complete required analysis; coverage is not a safety guarantee.",
    known_bad: "An exact artifact matched authoritative malicious intelligence; REVIEW findings are excluded.",
    latency: "Registry discovery to canonical scan completion. Published only after enough dated release records exist."
  }
};

const cachedPublicMetrics=unstable_cache(async()=>fetchPublicMetrics().catch(() => EMPTY),["public-metrics-v1"],{revalidate:300,tags:["public-intel"]});

export function getPublicMetrics(): Promise<PublicMetrics> { return cachedPublicMetrics(); }

async function fetchPublicMetrics(): Promise<PublicMetrics> {
  const db = publicDb();
  const mirror = async () => (await getPublicRegistrySnapshot())?.metrics || EMPTY;
  if (!db) return mirror();
  try {
    const [release, aggregate, refreshes] = await Promise.all([
      db.from("scan_publication_releases").select("accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256").eq("active", true).maybeSingle(),
      db.rpc("public_intelligence_metrics"),
      db.from("registry_refreshes").select("registry,completed_at").eq("status", "complete").order("completed_at", { ascending: false }).limit(20)
    ]);
    // Aggregate metrics are public trust claims. Never expose them unless the
    // same active release has passed the accuracy gate used for publication.
    if (release.error || !release.data || !hasAccuracyGateAttestation(release.data) || aggregate.error || !aggregate.data?.[0]) return mirror();
    const row = aggregate.data[0];
    const freshness: Record<string, string | null> = { "vs-marketplace": null, openvsx: null };
    for (const row of refreshes.data || []) if (!freshness[row.registry]) freshness[row.registry] = row.completed_at;
    return {
      ...EMPTY,
      as_of: new Date().toISOString(),
      indexed_extensions: Number(row.indexed_extensions || 0),
      exact_releases_indexed: Number(row.exact_releases_indexed || 0),
      exact_releases_analyzed: Number(row.exact_releases_analyzed || 0),
      analyzer_complete_reports: Number(row.analyzer_complete_reports || 0),
      known_bad_artifacts: Number(row.known_bad_artifacts || 0),
      block_decisions: Number(row.block_decisions || 0),
      high_risk_reviews: Number(row.high_risk_reviews || 0),
      freshness,
      time_to_analysis: Number(row.latency_sample_size || 0) >= 20 ? { sample_size: Number(row.latency_sample_size), median_minutes: Math.round(Number(row.median_minutes)), p95_minutes: Math.round(Number(row.p95_minutes)), status: "measured" } : EMPTY.time_to_analysis,
    };
  } catch {
    return mirror();
  }
}
