import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/DeepScanButton.tsx"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(process.cwd(), "app/globals.css"),
  "utf8",
);

describe("Deep Scan product control", () => {
  it("recovers from a failed queue network request", () => {
    expect(source).toContain("Deep Scan could not reach the analysis service");
    expect(source).toContain('setState("error")');
    expect(source).toContain("Check your connection and try again");
  });

  it("sends the Cloudflare/Supabase-compatible browser headers", () => {
    expect(source).toContain("browserAuthHeaders");
    expect(source).toContain("headers: { ...headers, \"Content-Type\": \"application/json\" }");
  });

  it("keeps the report link clear of guest-trial notices", () => {
    expect(source).toContain("deepScanActionWithReport");
    expect(styles).toContain(
      ".deepScanActionWithReport .actionNotice, .deepScanActionWithReport .actionError",
    );
    expect(styles).toContain("position: static");
  });
});
