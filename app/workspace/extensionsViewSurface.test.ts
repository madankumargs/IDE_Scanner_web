import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./views/ExtensionsView.tsx", import.meta.url), "utf8");

describe("workspace monitoring conversion", () => {
  it("lets a report-selected extension become an explicit monitored baseline", () => {
    expect(source).toContain("initialExtension");
    expect(source).toContain("Choose an exact extension release.");
    expect(source).toContain("Start monitoring");
    expect(source).toContain("/watchlist");
    expect(source).toContain("baseline_version");
    expect(source).toContain("report_monitor_setup_opened");
    expect(source).toContain("report_monitor_completed");
  });

  it("keeps monitoring an explicit user action", () => {
    expect(source).toContain("onSelect={setSelected}");
    expect(source).toContain("onClick={() => void monitorSelected()}");
  });
});
