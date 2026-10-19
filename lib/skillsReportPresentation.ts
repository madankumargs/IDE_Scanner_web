import type { SkillScanReport } from "@/lib/skillsScanner";

export function skillDecisionLabel(decision: SkillScanReport["decision"]) {
  if (decision === "allow") return "No policy finding in the covered snapshot";
  if (decision === "review") return "Review before trust";
  if (decision === "block") return "Do not trust this Skill";
  return "Coverage is incomplete";
}

export function skillDecisionReason(report: SkillScanReport) {
  if (report.decision === "block") {
    return "The covered evidence crossed the blocking threshold. Do not install or run this Skill until the source and findings have been independently resolved.";
  }
  if (report.decision === "review") {
    return `${report.findings.length} detection${report.findings.length === 1 ? "" : "s"} need human review before this Skill is trusted.`;
  }
  if (report.decision === "incomplete") {
    return `${report.coverage.requiredAnalyzers - report.coverage.completedRequired} required analyzer${report.coverage.requiredAnalyzers - report.coverage.completedRequired === 1 ? " is" : "s are"} incomplete, so this is not an approval.`;
  }
  return "The required static analyzers completed without a policy-relevant finding in this immutable snapshot.";
}

export function skillNextStep(report: SkillScanReport) {
  if (report.decision === "block") return "Do not install or run it. Open the detailed report to locate the blocking evidence.";
  if (report.decision === "review") return "Read each finding, verify the file locations, and record a human decision before use.";
  if (report.decision === "incomplete") return "Treat the result as unknown and open the detailed report to see what coverage is missing.";
  return "Use your normal organization controls and keep this exact commit as the reviewed source.";
}

export function skillReportIdentity(report: SkillScanReport) {
  return `${report.source.owner}/${report.source.repo}${report.source.skillPath ? `/${report.source.skillPath}` : ""}`;
}
