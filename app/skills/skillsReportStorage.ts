import type { SkillScanReport } from "@/lib/skillsScanner";

export const SKILLS_REPORT_STORAGE_KEY = "guardrails.skills.report.v1";

export function saveSkillReport(report: SkillScanReport) {
  try {
    window.sessionStorage.setItem(SKILLS_REPORT_STORAGE_KEY, JSON.stringify(report));
  } catch {
    // The public result remains usable if the browser blocks session storage.
  }
}

export function loadSkillReport(): SkillScanReport | null {
  try {
    const raw = window.sessionStorage.getItem(SKILLS_REPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SkillScanReport;
    if (!parsed?.source?.commit || !parsed?.artifact?.contentHash || !parsed?.decision) return null;
    return parsed;
  } catch {
    return null;
  }
}
