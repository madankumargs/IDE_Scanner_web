import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workspace = fs.readFileSync(
  path.join(root, "app/TeamWorkspace.tsx"),
  "utf8",
);
const page = fs.readFileSync(path.join(root, "app/workspace/page.tsx"), "utf8");
const css = fs.readFileSync(
  path.join(root, "app/workspace/teamWorkspace.module.css"),
  "utf8",
);

describe("GuardRails workspace product surface", () => {
  it("provides a persistent product navigation and account controls", () => {
    for (const label of [
      "Overview",
      "Inventory",
      "Review inbox",
      "Extensions",
      "Decisions",
      "Activity",
      "Settings",
      "Sign out",
    ]) {
      expect(workspace).toContain(label);
    }
  });

  it("uses an accessible custom workspace switcher instead of a native overlay select", () => {
    expect(workspace).toContain('aria-haspopup="listbox"');
    expect(workspace).toContain('role="option"');
    expect(workspace).not.toContain('<select aria-label="Switch workspace"');
  });

  it("requires rationale in the dedicated release review", () => {
    expect(workspace).toContain("ReviewDecisionPanel");
    expect(workspace).toContain("Decision rationale");
    expect(workspace).toContain("Saved with the audit record");
    expect(workspace).toContain("Block release");
    expect(workspace).toContain("Allow release");
  });

  it("gives first-time users a guided activation step", () => {
    expect(workspace).toContain("Step 1 of 3");
    expect(workspace).toContain("Set up your first release review.");
    expect(workspace).toContain("Exact release baselines");
  });

  it("continues onboarding through extension, baseline, teammate, and notifications", () => {
    expect(workspace).toContain("WorkspaceSetup");
    expect(workspace).toContain("Choose your first extension.");
    expect(workspace).toContain("Your baseline is ready.");
    expect(workspace).toContain("Invite the person who will review changes.");
    expect(workspace).toContain("Choose how GuardRails brings you back.");
    expect(workspace).toContain("Workspace ready");
    expect(workspace).toContain("guardrails:setup:");
  });

  it("offers clearly labeled non-destructive sample data", () => {
    expect(workspace).toContain("Preview sample workspace");
    expect(workspace).toContain("This preview uses example data");
    expect(workspace).toContain("cannot change your real workspace.");
    expect(workspace).toContain("Exit sample");
  });

  it("surfaces observable monitoring health and cadence", () => {
    expect(workspace).toContain("Registry checks are healthy");
    expect(workspace).toContain("Last registry check");
    expect(workspace).toContain("Next expected check");
    expect(workspace).toContain("Refresh status");
    expect(workspace).toContain("last_event_at");
  });

  it("makes monitoring health and the review queue visible", () => {
    for (const copy of [
      "Needs review",
      "Overdue",
      "Monitoring",
      "Workspace health",
      "Needs attention",
      "Monitoring health",
    ]) {
      expect(workspace).toContain(copy);
    }
  });

  it("clears data before a workspace switch refresh", () => {
    for (const reset of [
      "setAlerts([])",
      "setDecisions([])",
      "setMembers([])",
      "setWatchItems([])",
      "setBadgeItems([])",
    ]) {
      expect(workspace).toContain(reset);
    }
    expect(workspace).toContain('setDataState("error")');
    expect(workspace).toContain("responses.slice(0, 6)");
  });

  it("has explicit decision persistence feedback", () => {
    expect(workspace).toContain("Recording decision…");
    expect(workspace).toContain(
      "Decision recorded and added to the audit trail.",
    );
    expect(workspace).toContain(
      "Decision could not be saved. Your rationale is still here.",
    );
    expect(workspace).toContain("DecisionReceiptView");
    expect(workspace).toContain("Audit event");
    expect(workspace).toContain("Your rationale was preserved.");
    expect(workspace).toContain("You can retry without");
    expect(workspace).toContain("Retry");
  });

  it("provides personal review queues and persistent saved views", () => {
    expect(workspace).toContain("Assigned to me");
    expect(workspace).toContain("Saved views");
    expect(workspace).toContain("Save view");
    expect(workspace).toContain("guardrails:review-filters:");
    expect(workspace).toContain("decision.assigned_to === currentUserId");
    expect(workspace).toContain("Nothing is assigned to you.");
    expect(css).toContain(".savedFilters");
    expect(css).toContain(".personalEmpty");
  });

  it("uses route-scoped styling and responsive product layouts", () => {
    expect(page).toContain('import styles from "./workspace.module.css"');
    expect(workspace).toContain("teamWorkspace.module.css");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain(".sidebarOpen");
  });

  it("provides guarded member and role administration", () => {
    expect(workspace).toContain("Members & roles");
    expect(workspace).toContain("Confirm role change");
    expect(workspace).toContain("Final owner protected");
    expect(workspace).toContain("will never allow the final owner");
    expect(workspace).toContain("Read-only membership directory");
    expect(workspace).toContain("Create invitation link");
    expect(workspace).toContain("Owner access is never granted through");
  });
});
