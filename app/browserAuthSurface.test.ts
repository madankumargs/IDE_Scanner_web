import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Cloudflare-compatible browser auth surfaces", () => {
  it("routes the remaining public and invitation actions through the shared header fallback", () => {
    for (const file of [
      "app/WatchExtension.tsx",
      "app/ReleaseEventQueue.tsx",
      "app/InvitationAcceptance.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("browserAuthHeaders");
      expect(source).not.toContain(".auth.getSession");
      expect(source).toContain("headers");
    }
    expect(read("app/TeamDecisionAction.tsx")).toContain("headers: { ...headers,");
    expect(read("app/WatchExtension.tsx")).toContain("/api/teams/");
  });

  it("passes the shared auth header getter through workspace activity and mutations", () => {
    const workspace = read("app/TeamWorkspace.tsx");
    const activity = read("app/workspace/views/ActivityView.tsx");

    expect(workspace).toContain("const getAuthHeaders = useCallback(() => browserAuthHeaders(db), [db]);");
    expect(workspace).toContain("getAuthHeaders={getAuthHeaders}");
    expect(activity).toContain("getAuthHeaders: () => Promise<Record<string, string>>");
    expect(activity).toContain("headers,");
  });

  it("uses the same fallback for auth gates and account setup", () => {
    expect(read("app/workspace/page.tsx")).toContain("browserAuthHeaders(db)");
    expect(read("app/monitor/page.tsx")).toContain("browserAuthHeaders(db)");
    expect(read("app/account/page.tsx")).toContain("browserAuthHeaders(db)");
    expect(read("app/HeaderAccount.tsx")).toContain("/api/auth/session");
  });

  it("keeps Deep Scan routes compatible with either authenticated provider", () => {
    expect(read("app/api/deep-scans/route.ts")).toContain("authenticated(request)");
    expect(read("app/api/deep-scans/[id]/route.ts")).toContain("authenticated(request)");
  });
});
