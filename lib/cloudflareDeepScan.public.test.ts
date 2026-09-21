import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  db: null as {
    prepare: ReturnType<typeof vi.fn>;
    batch: ReturnType<typeof vi.fn>;
  } | null,
  privateDb: vi.fn(),
  runnerCompleted: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloudflarePrivate", () => ({
  privateDb: harness.privateDb,
  parseCookies: vi.fn(() => ({})),
  newId: vi.fn(() => "new-id"),
  nowIso: vi.fn(() => "2026-09-19T00:00:00.000Z"),
  requestIsSecure: vi.fn(() => true),
  sessionHash: vi.fn(() => "session-hash"),
}));
vi.mock("@/lib/cloudflareRunnerStatus", () => ({
  markCloudflareRunnerClaimed: vi.fn(),
  markCloudflareRunnerCompleted: harness.runnerCompleted,
  markCloudflareRunnerError: vi.fn(),
  recordCloudflareRunnerHeartbeat: vi.fn(),
}));
vi.mock("@/lib/runtimeEnv", () => ({ runtimeEnv: vi.fn(() => "") }));
vi.mock("@/lib/marketplace", () => ({ resolveMarketplaceExtension: vi.fn() }));
vi.mock("@/lib/cloudflareRegistry", () => ({
  getCloudflareRegistryCatalogExtension: vi.fn(),
  getCloudflareRegistryProduct: vi.fn(),
}));
vi.mock("@/lib/cloudflareGithubDispatch", () => ({ dispatchGithubDeepScan: vi.fn() }));

import { claimCloudflareJob, saveCloudflareScanResult } from "@/lib/cloudflareDeepScan";

const build = "a".repeat(40);
const artifactSha = "d".repeat(64);

function makeDb(job: Record<string, unknown>) {
  const first = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(job);
  const statement = { bind: vi.fn(() => ({ first })) };
  const db = {
    prepare: vi.fn(() => statement),
    batch: vi.fn().mockResolvedValue(undefined),
  };
  harness.db = db;
  harness.privateDb.mockReturnValue(db);
  return db;
}

function validBundle() {
  return {
    metadata: {
      schema_version: "2.3",
      profile: "deep",
      scanner_version: "engine-1",
      scanner_build: build,
      ruleset_version: "rules-1",
      policy_version: "3.0.0",
      intelligence_snapshot: {
        dynamic_sandbox: {
          status: "executed",
          execution: "controlled-bubblewrap",
          runtime_policy: "capability-gated-v1",
          executed: true,
          external_syscall_trace: false,
          external_syscall_trace_available: true,
        },
        registry: {
          sha256: "c".repeat(64),
          payload: { findings: [], errors: [] },
        },
      },
    },
    extensions: [{
      extension_id: "publisher.extension",
      version: "1.0.0",
      score_schema_version: "2",
      analysis_status: "complete",
      decision: "allow",
      artifact_identity: { extension_id: "publisher.extension", version: "1.0.0", sha256: artifactSha },
      analysis_coverage: {
        status: "complete",
        executable_file_coverage_percent: 100,
        required_providers_complete: true,
        providers: {
          dynamic_sandbox: {
            status: "not-applicable",
            execution: "policy-gated",
            executed: false,
            required: false,
            policy: "capability-gated-v1",
            external_syscall_trace: false,
          },
        },
      },
    }],
  };
}

describe("Cloudflare canonical scan callback", () => {
  beforeEach(() => {
    harness.privateDb.mockReset();
    harness.runnerCompleted.mockReset();
    harness.runnerCompleted.mockResolvedValue(undefined);
  });

  it("rejects a forged public result before it can enter D1", async () => {
    const db = makeDb({
      id: "job-1",
      extension_id: "publisher.extension",
      version: "1.0.0",
      profile: "deep",
      scan_purpose: "public_intelligence",
      expected_scanner_build: build,
    });
    const bundle = validBundle();
    bundle.metadata.schema_version = "2.2";

    await expect(saveCloudflareScanResult("job-1", bundle)).rejects.toThrow("report schema 2.3");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("persists a complete canonical public result after shared admission", async () => {
    const db = makeDb({
      id: "job-1",
      extension_id: "publisher.extension",
      version: "1.0.0",
      profile: "deep",
      scan_purpose: "public_intelligence",
      expected_scanner_build: build,
    });

    await expect(saveCloudflareScanResult("job-1", validBundle())).resolves.toEqual(expect.any(String));
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(harness.runnerCompleted).toHaveBeenCalledTimes(1);
  });

  it("does not let a losing concurrent worker scan the same queued job", async () => {
    const queued = {
      id: "job-1",
      extension_id: "publisher.extension",
      version: "1.0.0",
      status: "queued",
    };
    const first = vi.fn().mockResolvedValue(queued);
    const run = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
    const db = {
      prepare: vi.fn((query: string) => query.startsWith("SELECT * FROM app_scan_jobs")
        ? { bind: vi.fn(() => ({ first })) }
        : { bind: vi.fn(() => ({ run })) }),
    };
    harness.privateDb.mockReturnValue(db);

    await expect(claimCloudflareJob({
      runnerId: "runner-1",
      jobId: null,
      githubRunId: 123,
      githubSha: build,
    })).resolves.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
