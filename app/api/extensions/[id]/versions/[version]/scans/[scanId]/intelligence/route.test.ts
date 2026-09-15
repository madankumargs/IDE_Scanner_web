import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route";
import { getVersionScanProduct } from "@/lib/productData";
import { serverDb } from "@/lib/supabaseServer";
import { privateDb, userFromSession } from "@/lib/cloudflarePrivate";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { createEvidenceIntelligenceReport } from "@/lib/sarvam";

vi.mock("@/lib/productData", () => ({ getVersionScanProduct: vi.fn() }));
vi.mock("@/lib/supabaseServer", () => ({ serverDb: vi.fn() }));
vi.mock("@/lib/cloudflarePrivate", () => ({ privateDb: vi.fn(), userFromSession: vi.fn() }));
vi.mock("@/lib/cloudflareDeepScan", () => ({ cloudflarePrivateAvailable: vi.fn(() => false) }));
vi.mock("@/lib/sarvam", () => ({
  createEvidenceIntelligenceReport: vi.fn(),
  SarvamConfigurationError: class SarvamConfigurationError extends Error {},
  SarvamProviderError: class SarvamProviderError extends Error { status = 502; },
  SarvamOutputError: class SarvamOutputError extends Error {},
}));

const mockedProduct = vi.mocked(getVersionScanProduct);
const mockedServerDb = vi.mocked(serverDb);
const mockedIntelligence = vi.mocked(createEvidenceIntelligenceReport);
const mockedCloudflare = vi.mocked(cloudflarePrivateAvailable);
const originalFlag = process.env.SARVAM_INTELLIGENCE_REPORT_ENABLED;

afterEach(() => {
  vi.clearAllMocks();
  mockedCloudflare.mockReturnValue(false);
  if (originalFlag === undefined) delete process.env.SARVAM_INTELLIGENCE_REPORT_ENABLED;
  else process.env.SARVAM_INTELLIGENCE_REPORT_ENABLED = originalFlag;
});

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

function validProduct() {
  return {
    version: "1.2.3",
    scan: { id: "scan-1", extension_id: "publisher.extension", version: "1.2.3", artifact_sha256: "a".repeat(64), analysis_status: "complete", decision: "review", coverage_percent: 100, capabilities: { network: true } },
    findings: [{ id: "finding-1", rule_id: "network-egress", summary: "Outbound request" }],
    files: [],
    dependencies: [],
  };
}

describe("evidence intelligence route", () => {
  it("requires authentication before loading the report or spending credits", async () => {
    mockedServerDb.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } } as never);
    const response = await POST(request({ audience: "security_lead" }), { params: Promise.resolve({ id: "publisher.extension", version: "1.2.3", scanId: "scan-1" }) });
    expect(response.status).toBe(401);
    expect(mockedProduct).not.toHaveBeenCalled();
    expect(mockedIntelligence).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before touching auth or report data", async () => {
    const response = await POST(request({ audience: "security_lead" }, "https://attacker.example"), { params: Promise.resolve({ id: "publisher.extension", version: "1.2.3", scanId: "scan-2" }) });
    expect(response.status).toBe(403);
    expect(mockedServerDb).not.toHaveBeenCalled();
    expect(mockedProduct).not.toHaveBeenCalled();
  });

  it("binds Sarvam generation to the exact server-loaded report", async () => {
    mockedServerDb.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "route-user-1" } } }) } } as never);
    mockedProduct.mockResolvedValue(validProduct() as never);
    mockedIntelligence.mockResolvedValue({ model: "sarvam-105b", report: { validation: { status: "validated" }, identity: { extension_id: "publisher.extension", version: "1.2.3", scan_id: "scan-1" }, deterministic: { decision: "review" } } as never });

    const response = await POST(request({ audience: "engineer", report: { fake: "client-controlled" }, depth: "standard" }), { params: Promise.resolve({ id: "publisher.extension", version: "1.2.3", scanId: "scan-1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.identity).toMatchObject({ extension_id: "publisher.extension", version: "1.2.3", scan_id: "scan-1" });
    expect(body.deterministic.decision).toBe("review");
    expect(mockedProduct).toHaveBeenCalledWith("publisher.extension", "1.2.3", "scan-1", expect.anything(), { compact: true, includePreviews: false, skipCloudflareCatalog: true });
    expect(mockedIntelligence).toHaveBeenCalledWith(expect.objectContaining({ identity: expect.objectContaining({ scan_id: "scan-1" }) }), "engineer", "standard");
    expect(JSON.stringify(body)).not.toContain("client-controlled");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects a mismatched exact scan identity", async () => {
    mockedServerDb.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "route-user-2" } } }) } } as never);
    mockedProduct.mockResolvedValue({ scan: { id: "other-scan", extension_id: "publisher.extension", version: "1.2.3" } } as never);
    const response = await POST(request({ audience: "security_lead" }), { params: Promise.resolve({ id: "publisher.extension", version: "1.2.3", scanId: "scan-3" }) });
    expect(response.status).toBe(404);
    expect(mockedIntelligence).not.toHaveBeenCalled();
  });

  it("supports an operator kill switch without calling the provider", async () => {
    process.env.SARVAM_INTELLIGENCE_REPORT_ENABLED = "false";
    mockedServerDb.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "route-user-3" } } }) } } as never);
    const response = await POST(request({ audience: "security_lead" }), { params: Promise.resolve({ id: "publisher.extension", version: "1.2.3", scanId: "scan-4" }) });
    expect(response.status).toBe(503);
    expect(mockedProduct).not.toHaveBeenCalled();
    expect(mockedIntelligence).not.toHaveBeenCalled();
  });

  it("does not require the D1 limiter in the Supabase test fallback", () => {
    expect(privateDb).not.toHaveBeenCalled();
    expect(userFromSession).not.toHaveBeenCalled();
  });
});
