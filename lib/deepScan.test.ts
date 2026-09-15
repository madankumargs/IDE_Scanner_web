import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/deepScanHealth", () => ({ getDeepScanHealth: vi.fn() }));
import { dispatchDeepScan, withReportUrl } from "@/lib/deepScan";

const originalToken = process.env.GITHUB_ACTIONS_TOKEN;
const originalFetch = global.fetch;

afterEach(() => {
  if (originalToken === undefined) delete process.env.GITHUB_ACTIONS_TOKEN;
  else process.env.GITHUB_ACTIONS_TOKEN = originalToken;
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe("withReportUrl", () => {
  it("links terminal results to the immutable scan", () => {
    expect(withReportUrl({
      status: "complete",
      extension_id: "Anthropic.claude-code",
      version: "2.1.218",
      scan_id: "scan-1",
    }).report_url).toBe("/extensions/Anthropic.claude-code/versions/2.1.218/scans/scan-1");
  });

  it("does not expose a report link before a terminal result exists", () => {
    expect(withReportUrl({
      status: "running",
      extension_id: "Anthropic.claude-code",
      version: "2.1.218",
    }).report_url).toBeUndefined();
  });
});

describe("dispatchDeepScan", () => {
  function configureDb(reserved: boolean) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }));
    mocks.from.mockImplementation((table: string) => table === "scan_job_events" ? { insert } : table === "scan_jobs" ? { update } : {});
    mocks.rpc.mockResolvedValue({ data: reserved, error: null });
    return { insert, update };
  }

  it("fails closed when dispatch credentials are absent", async () => {
    delete process.env.GITHUB_ACTIONS_TOKEN;
    await expect(dispatchDeepScan("job-1")).rejects.toThrow("not configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not dispatch when another worker holds the reservation", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "test-token";
    configureDb(false);
    global.fetch = vi.fn();
    await expect(dispatchDeepScan("job-1", 120)).resolves.toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_deep_scan_dispatch", { p_job_id: "job-1", p_minimum_interval_seconds: 120, p_max_attempts: 4 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("records accepted dispatch only after GitHub accepts the workflow", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "test-token";
    const { insert, update } = configureDb(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(dispatchDeepScan("job-1")).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/actions/workflows/deep-scan.yml/dispatches"), expect.objectContaining({ method: "POST" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle_stage: "dispatched", dispatch_succeeded_at: expect.any(String) }));
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("does not mark a dispatch successful when GitHub rejects it", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "test-token";
    const { insert, update } = configureDb(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(dispatchDeepScan("job-1")).rejects.toThrow("503");
    expect(update).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps queued jobs retryable when workflow dispatch lacks permission", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "test-token";
    const { insert, update } = configureDb(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(dispatchDeepScan("job-1")).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ event_type: "dispatch_deferred", stage: "queued" }));
  });

  it("retries a transient GitHub failure before accepting the dispatch", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "test-token";
    const { insert, update } = configureDb(true);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await expect(dispatchDeepScan("job-1")).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle_stage: "dispatched" }));
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
