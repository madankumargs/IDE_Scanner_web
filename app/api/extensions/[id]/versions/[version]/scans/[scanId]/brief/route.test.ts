import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/extensions/[id]/versions/[version]/scans/[scanId]/brief/route";

describe("retired evidence brief route", () => {
  it("fails closed and points callers to the validated reviewer guide", async () => {
    const response = await POST(
      new Request("http://localhost/api/brief", { method: "POST" }),
      {
        params: Promise.resolve({
          id: "publisher.extension",
          version: "1.2.3",
          scanId: "scan-1",
        }),
      },
    );
    const body = await response.json();
    expect(response.status).toBe(410);
    expect(body.code).toBe("reviewer_guide_required");
    expect(body.reviewer_guide_path).toBe(
      "/extensions/publisher.extension/versions/1.2.3/scans/scan-1#intelligence",
    );
  });
});
