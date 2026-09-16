import { ChevronRight } from "lucide-react";
import DecisionSummary from "@/app/dossier/DecisionSummary";
import DossierSectionHead from "@/app/dossier/DossierSectionHead";
import ReportIdentityPanel from "@/app/dossier/ReportIdentityPanel";
import ScoreStat from "@/app/dossier/ScoreStat";
import SeverityGauge from "@/app/SeverityGauge";
import { coveragePresentation } from "@/lib/classificationContract";
import { decisionExplanation, decisionHeadline, decisionLabel, evidenceSectionLabel, outcomeGroupSummary } from "@/lib/dossierPresentation";
import type { ReportScan } from "@/lib/reportContract";
import type { CapabilityRecord } from "@/app/dossier/CapabilitiesSection";
import type { EvidenceGroupData } from "@/app/dossier/AlertsSection";

export default function OverviewSection({ decision, scan, actionableGroups, noteGroups, capabilities, onOpenAlerts }: { decision: string; scan: ReportScan; actionableGroups: EvidenceGroupData[]; noteGroups: EvidenceGroupData[]; capabilities: Record<string, CapabilityRecord>; onOpenAlerts: () => void }) {
  const malware = Number(scan.malware_score || 0);
  const risk = Number(scan.risk_score || 0);
  const legacyScore = String(scan.score_schema_version || "1") === "1";
  const coverage = coveragePresentation(scan);
  const canonicalReason = String(scan.decision_reason || decisionExplanation(decision));
  const gaugeBand = decision === "block" ? "high" : decision === "review" ? "mid" : decision === "allow" ? "low" : "info";
  return <>
    <DossierSectionHead eyebrow="Decision context" title={decisionHeadline(decision)} detail={detailFor(decision, canonicalReason)} />
    <DecisionSummary decision={decision} scan={scan} />
    <ol className="reportTrace" aria-label="Decision trace">
      <TraceStep number="1" title="Artifact bound" detail="Extension, version, hash, and scan identity fixed" />
      <TraceStep number="2" title="Analysis checked" detail={coverage.label} />
      <TraceStep number="3" title="Evidence grouped" detail={`${actionableGroups.length} actionable · ${noteGroups.length} contextual`} />
      <TraceStep number="4" title="Policy applied" detail="Exact-release ruleset evaluated" />
      <TraceStep number="5" title={decisionLabel(decision)} detail="Current decision for this artifact" />
    </ol>
    <div className="overviewLede"><div className="overviewGauge"><SeverityGauge value={Math.max(malware, risk)} label={decisionLabel(decision)} band={gaugeBand} caption="Diagnostic risk index for this exact artifact — not a probability of malice." /></div><div className="reportSnapshot reportSnapshotExpanded"><article><span>Outcome</span><strong>{decisionLabel(decision)}</strong><p>Policy result for this exact artifact</p></article><ScoreStat label={coverage.label} value={coverage.percent} detail={coverage.providerDetail} /><ScoreStat label={legacyScore ? "Legacy malware signal" : "Malware signal"} value={malware} detail={legacyScore ? "Static correlation; not confirmed malware" : "Diagnostic index, not probability"} /><article><span>Evidence groups</span><strong>{actionableGroups.length}</strong><p>{noteGroups.length} contextual notes kept separate</p></article><article><span>Capabilities</span><strong>{Object.keys(capabilities).length}</strong><p>Power describes access, not intent</p></article></div></div>
    <div className="overviewGrid"><article className="whyCard"><span>Why this outcome</span><h3>{outcomeGroupSummary(decision, actionableGroups.length)}</h3><p>{canonicalReason}</p><button type="button" onClick={onOpenAlerts}>Inspect all evidence <ChevronRight /></button></article><ReportIdentityPanel scan={scan} /></div>
    <section className="evidencePreview"><div><span>{evidenceSectionLabel(decision)}</span><button type="button" onClick={onOpenAlerts}>Open evidence <ChevronRight /></button></div>{actionableGroups.slice(0, 3).map((group) => <article key={group.rule} className="ds-evidence-preview"><span className={`ds-pill ${pillVariant(group.severity)}`}>{displaySeverity(group.severity)}</span><div><strong>{group.summary}</strong><p>{group.count} observed location{group.count === 1 ? "" : "s"} · {actionabilityLabel(group.actionability)}</p></div></article>)}</section>
  </>;
}

function TraceStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <li><b>{number}</b><strong>{title}</strong><small>{detail}</small></li>;
}

function detailFor(decision: string, reason: string) {
  if (decision === "allow") return "Required analysis completed without evidence that crosses the active review policy.";
  if (decision === "block") return "Inspect the evidence that supports this do-not-install policy decision.";
  return decision === "incomplete" || decision === "failed" ? reason : "Review the grouped evidence, affected locations, and whether each behavior matches the extension’s purpose.";
}
function displaySeverity(value: string) { return value === "INFO" ? "INFORMATIONAL" : value; }
function pillVariant(severity: string) { const rank = severityRank(severity); return rank >= 4 ? "block" : rank === 3 ? "review" : rank === 2 ? "info" : "allow"; }
function severityRank(value: string) { return ({ CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 } as Record<string, number>)[value] || 0; }
function actionabilityLabel(value: string) { return value === "block" ? "block evidence" : value === "investigate" ? "investigation evidence" : value === "review" ? "review evidence" : value === "low" ? "low hardening note" : "contextual observation"; }
