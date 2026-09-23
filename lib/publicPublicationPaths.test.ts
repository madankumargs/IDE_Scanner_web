import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  db: { from: vi.fn() },
  publicDb: vi.fn(),
  snapshot: vi.fn(),
  product: vi.fn(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ publicDb: harness.publicDb }));
vi.mock("@/lib/publicRegistrySnapshot", () => ({
  getPublicRegistrySnapshot: harness.snapshot,
  getPublicRegistryProduct: harness.product,
}));
vi.mock("@/lib/marketplace", () => ({
  isConcreteVersion: () => true,
  listMarketplaceVersions: vi.fn(async () => []),
  resolveMarketplaceExtension: vi.fn(async () => null),
  searchMarketplace: vi.fn(async () => []),
}));
vi.mock("@/lib/cloudflareRegistry", () => ({
  getCloudflareRegistryCatalogExtension: vi.fn(async () => null),
  getCloudflareRegistryProduct: vi.fn(async () => null),
  getCloudflareRegistrySection: vi.fn(async () => null),
}));
vi.mock("@/lib/cloudflareDeepScan", () => ({
  cloudflarePrivateAvailable: () => false,
  getCloudflareScanProduct: vi.fn(async () => null),
  getCloudflareScanSummary: vi.fn(async () => null),
}));
vi.mock("@/lib/publicationHealth", () => ({
  hasAccuracyGateAttestation: (value: Record<string, unknown> | null | undefined) => Boolean(
    value?.accuracy_gate_corpus_id
    && value?.accuracy_gate_corpus_version
    && /^[0-9a-f]{64}$/i.test(String(value?.accuracy_gate_sha256 || "")),
  ),
}));

import { getBadgeDecision, getPublicAnalysisHistory, getVersionScanProduct } from "./productData";

const build = "a".repeat(40);
const attestedRelease = {
  id: "release-1",
  policy_version: "policy-1",
  ruleset_version: "rules-1",
  score_schema_version: "schema-1",
  scanner_build: build,
  accuracy_gate_corpus_id: "holdout-1",
  accuracy_gate_corpus_version: "2026-09-19",
  accuracy_gate_sha256: "b".repeat(64),
};

function query(table: string, result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit", "ilike"]) {
    builder[method] = (...args: unknown[]) => {
      harness.calls.push({ table, method, args });
      return builder;
    };
  }
  builder.maybeSingle = () => builder;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function configureDatabase(release: unknown, members: unknown[] = [], scans: unknown[] = [], extensions: unknown[] = []) {
  harness.calls = [];
  harness.db.from.mockImplementation((table: string) => query(table, {
    "scan_publication_releases": { data: release, error: null },
    "scan_publication_release_scans": { data: members, error: null },
    scans: { data: scans, error: null },
    extensions: { data: extensions, error: null },
  }[table] || { data: [], error: null }));
  harness.publicDb.mockReturnValue(harness.db);
}

const mirroredHistory = {
  scan_id: "mirror-1",
  extension_id: "mirror.extension",
  version: "1.0.0",
  display_name: "Mirror Extension",
  severity: "INFO",
  decision: "allow",
  public_outcome: "clear",
  decision_basis: "published_release",
  evidence_confidence: "high",
  scanned_at: "2026-09-19T00:00:00Z",
  coverage_percent: 100,
  decision_reason: "Published exact artifact.",
  publisher: "mirror",
  publisher_verified: true,
  description: "",
  icon_url: "",
  risk_score: 0,
  malware_score: 0,
  artifact_sha256: "c".repeat(64),
  provenance_tier: "publisher",
  expected_profile_id: "default",
  capability_assessment: {},
  scanner_build: build,
  ruleset_version: "rules-1",
  score_schema_version: "schema-1",
};

describe("public publication boundaries", () => {
  it("does not expose live history when the active release is unattested", async () => {
    harness.snapshot.mockReset().mockResolvedValue({ history: [mirroredHistory] });
    configureDatabase(null, [], [{ id: "unpublished-1" }]);

    const result = await getPublicAnalysisHistory();

    expect(result.items[0]?.scan_id).toBe("mirror-1");
    expect(result.items).toHaveLength(1);
    expect(harness.calls.some((call) => call.table === "scans")).toBe(false);
  });

  it("constrains live history to the attested release identity and members", async () => {
    harness.snapshot.mockReset().mockResolvedValue(null);
    configureDatabase(
      { ...attestedRelease },
      [{ scan_id: "public-1" }],
      [{
        id: "public-1",
        extension_id: "publisher.extension",
        version: "1.0.0",
        artifact_sha256: "c".repeat(64),
        severity: "INFO",
        decision: "allow",
        public_outcome: "clear",
        decision_basis: "published_release",
        evidence_confidence: "high",
        provenance_tier: "publisher",
        expected_profile_id: "default",
        capability_assessment: {},
        score_schema_version: "schema-1",
        risk_score: 0,
        malware_score: 0,
        coverage_percent: 100,
        scanner_build: build,
        ruleset_version: "rules-1",
        scanned_at: "2026-09-19T00:00:00Z",
      }],
      [{ id: "publisher.extension", display_name: "Published Extension", publisher: "publisher", description: "", icon_url: "", publisher_verified: true }],
    );

    const result = await getPublicAnalysisHistory();
    const scanCalls = harness.calls.filter((call) => call.table === "scans");

    expect(result.items[0]?.scan_id).toBe("public-1");
    expect(scanCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "eq", args: ["policy_version", "policy-1"] }),
      expect.objectContaining({ method: "eq", args: ["ruleset_version", "rules-1"] }),
      expect.objectContaining({ method: "eq", args: ["score_schema_version", "schema-1"] }),
      expect.objectContaining({ method: "eq", args: ["scanner_build", build] }),
      expect.objectContaining({ method: "in", args: ["id", ["public-1"]] }),
    ]));
  });

  it("does not expose a raw database badge when no attested release exists", async () => {
    harness.snapshot.mockReset().mockResolvedValue(null);
    harness.product.mockReset().mockResolvedValue(null);
    configureDatabase(null);
    harness.db.from.mockImplementation((table: string) => query(table, table === "extensions"
      ? { data: { id: "publisher.extension" }, error: null }
      : table === "scan_publication_releases"
        ? { data: null, error: null }
        : { data: [], error: null }));

    const result = await getBadgeDecision("publisher.extension");

    expect(result.found).toBe(false);
    expect(result.decision).toBeNull();
  });

  it("does not load an arbitrary immutable scan ID from the database", async () => {
    harness.snapshot.mockReset().mockResolvedValue(null);
    harness.product.mockReset().mockResolvedValue(null);
    harness.calls = [];
    harness.db.from.mockImplementation((table: string) => query(table, {
      extensions: { data: { id: "publisher.extension" }, error: null },
      extension_versions: { data: { extension_id: "publisher.extension", version: "1.0.0" }, error: null },
      scan_publication_releases: { data: null, error: null },
      scan_job_results: { data: [], error: null },
    }[table] || { data: [], error: null }));
    harness.publicDb.mockReturnValue(harness.db);

    await expect(getVersionScanProduct("publisher.extension", "1.0.0", "unpublished-scan")).resolves.toBeNull();
    expect(harness.calls.some((call) => call.table === "scans")).toBe(false);
  });

  it("serves an attested registry snapshot when the private report is not on the active join", async () => {
    harness.snapshot.mockReset().mockResolvedValue(null);
    harness.product.mockReset().mockResolvedValue({
      detail_state: "summary_only",
      extension: { id: "publisher.extension" },
      versions: [{ extension_id: "publisher.extension", version: "1.0.0" }],
      scans: [{
        version: "1.0.0",
        scan: {
          id: "published-scan",
          extension_id: "publisher.extension",
          version: "1.0.0",
          artifact_sha256: "a".repeat(64),
          analysis_status: "complete",
          decision: "allow",
        },
        findings: [],
        files: [],
        dependencies: [],
      }],
    });
    configureDatabase(null);

    const result = await getVersionScanProduct("publisher.extension", "1.0.0", "published-scan");

    expect(result?.scan).toMatchObject({
      id: "published-scan",
      extension_id: "publisher.extension",
      version: "1.0.0",
    });
    expect(result?.findings).toEqual([]);
  });
});
