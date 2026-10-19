import { Check, CircleAlert, CircleHelp } from "lucide-react";
import { coveragePresentation } from "@/lib/classificationContract";
import type { ReportScan } from "@/lib/reportContract";
import styles from "./decisionTree.module.css";

export default function DecisionTree({ scan, actionableCount, contextualCount }: { scan: ReportScan; actionableCount: number; contextualCount: number }) {
  const coverage = coveragePresentation(scan);
  const complete = scan.analysis_status === "complete";
  const decision = String(scan.decision || "incomplete");
  const steps = [
    { label: "Artifact bound", detail: "Exact release, hash, and scan identity", state: scan.artifact_sha256 ? "complete" : "unknown" },
    { label: "Analysis complete", detail: complete ? "Required analysis finished" : "Completion is not recorded", state: complete ? "complete" : "unknown" },
    { label: "Coverage recorded", detail: coverage.label, state: coverage.percent > 0 ? "complete" : "unknown" },
    { label: "Evidence grouped", detail: `${actionableCount} actionable · ${contextualCount} contextual`, state: complete ? "complete" : "unknown" },
    { label: "Decision", detail: decisionLabel(decision), state: decision === "incomplete" ? "unknown" : "decision" },
  ] as const;
  return <section className={styles.tree} aria-label="Decision tree"><header><span>Decision path</span><strong>How this exact-release result was determined</strong><p>Each step uses the same scan identity and evidence shown in the report.</p></header><ol>{steps.map((step, index) => <li key={step.label} data-state={step.state}><div className={styles.node}>{step.state === "complete" ? <Check aria-hidden="true" /> : step.state === "decision" ? <CircleAlert aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}</div><div><strong>{step.label}</strong><small>{step.detail}</small></div>{index < steps.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}</li>)}</ol></section>;
}

function decisionLabel(value: string) {
  if (value === "allow") return "Proceed under normal controls";
  if (value === "block") return "Do not install";
  if (value === "review") return "Review before installing";
  return "Analysis incomplete";
}
