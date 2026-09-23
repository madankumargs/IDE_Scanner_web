import type { Finding, Severity } from "./types";

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 40, high: 20, medium: 8, low: 3, info: 0 };

export function scoreFindings(findings: Finding[]) {
  const riskScore = Math.max(0, 100 - findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0));
  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;
  const decision = criticalCount > 0 ? "block" : highCount > 0 ? "review" : "allow";
  const verdict = criticalCount > 0 ? "malicious" : highCount > 0 ? "suspicious" : "clean";
  const highestSeverity: Severity = findings.find(f => f.severity === "critical")?.severity ?? findings.find(f => f.severity === "high")?.severity ?? findings.find(f => f.severity === "medium")?.severity ?? findings.find(f => f.severity === "low")?.severity ?? "info";
  return {
    decision, verdict, severity: highestSeverity.toUpperCase(), risk_score: riskScore,
    malware_score: criticalCount > 0 ? Math.min(100, 60 + criticalCount * 10) : 0,
    capability_assessment: { unexpected: findings.filter(f => f.severity === "critical" || f.severity === "high").map(f => f.title) },
    analysis_coverage: { status: "complete" },
    decision_reason: !findings.length ? "No risk patterns matched across the analyzed source." : `${findings[0].title} (${findings[0].category}, ${findings.length} finding${findings.length === 1 ? "" : "s"} total).`,
  } as const;
}
