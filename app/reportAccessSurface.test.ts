import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const access = readFileSync(new URL("../lib/reportAccess.ts", import.meta.url), "utf8");
const jsonRoute = readFileSync(new URL("./api/extensions/[id]/versions/[version]/scans/[scanId]/route.ts", import.meta.url), "utf8");
const exportRoute = readFileSync(new URL("./api/extensions/[id]/versions/[version]/scans/[scanId]/export/route.ts", import.meta.url), "utf8");

describe("detailed report access boundary", () => {
  it("requires an authenticated account for machine-readable detailed evidence", () => {
    expect(access).toContain("userFromSession");
    expect(jsonRoute).toContain("auth_required");
    expect(exportRoute).toContain("auth_required");
    expect(exportRoute).toContain("reportAccessUser");
  });
});
