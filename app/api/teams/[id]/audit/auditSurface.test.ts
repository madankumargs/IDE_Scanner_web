import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/teams/[id]/audit/route.ts"),
  "utf8",
);
const workspace = fs.readFileSync(
  path.join(process.cwd(), "app/TeamWorkspace.tsx"),
  "utf8",
);

describe("workspace audit product", () => {
  it("authorizes reads and protects exports from viewer access", () => {
    expect(route).toContain('"owner"');
    expect(route).toContain('"viewer"');
    expect(route).toContain('role === "viewer"');
    expect(route).toContain("Viewer access does not include audit export");
  });

  it("normalizes multiple workspace security event sources without channel secrets", () => {
    for (const table of [
      "team_decisions",
      "team_monitoring_alerts",
      "team_notification_deliveries",
      "team_digest_deliveries",
      "team_audit_events",
    ]) {
      expect(route).toContain(table);
    }
    expect(route).not.toContain("target_encrypted");
    expect(route).toContain('"badge"');
    expect(route).toContain('rawAction.startsWith("team_badge_")');
  });

  it("uses a durable trigger-backed audit store that removes channel secrets", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260806180000_unified_team_audit_history.sql",
      ),
      "utf8",
    );
    expect(migration).toContain(
      "create table if not exists public.team_audit_events",
    );
    expect(migration).toContain("private.capture_team_audit_event()");
    expect(migration).toContain("before_row - 'target_encrypted'");
    expect(migration).toContain("after_row - 'target_encrypted'");
    expect(migration).toContain("members read team audit events");
  });

  it("offers filters, JSON and CSV exports, errors, and viewer state", () => {
    expect(workspace).toContain("Audit filters and export");
    expect(workspace).toContain("Export CSV");
    expect(workspace).toContain("Export JSON");
    expect(workspace).toContain("Viewer access · export unavailable");
    expect(workspace).toContain("Audit history is unavailable");
  });
});
