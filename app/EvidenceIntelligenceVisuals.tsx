"use client";

import { ArrowDown, ArrowRight, CircleHelp, ExternalLink, Network, ShieldAlert } from "lucide-react";
import type { BlastRadiusAssessment, DataFlowEdge, DataFlowNode, EvidenceReference, ReviewerGuideChainStep } from "@/lib/evidenceIntelligence";
import styles from "./evidenceIntelligence.module.css";

export function EvidenceFlowVisual({
  nodes,
  edges,
  evidence,
}: {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  evidence: EvidenceReference[];
}) {
  if (!edges.length) {
    return <div className={styles.visualEmpty}><CircleHelp aria-hidden="true" /><p>No evidence-backed data-flow edge was normalized for this report.</p></div>;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return (
    <div className={styles.flowVisual} aria-label="Evidence-backed extension data-flow map">
      <div className={styles.flowLegend}>
        <span><i className={styles.nodeExtension} /> Extension</span>
        <span><i className={styles.nodeAsset} /> Local asset</span>
        <span><i className={styles.nodeExternal} /> External surface</span>
      </div>
      <ol className={styles.flowList}>
        {edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          return (
            <li key={edge.id} className={styles.flowItem}>
              <FlowNode node={from} evidence={evidence} />
              <div className={styles.flowConnector} aria-hidden="true"><ArrowDown /><span>{edge.action}</span></div>
              <FlowNode node={to} evidence={evidence} />
              <EvidenceRefs refs={edge.evidence_refs} evidence={evidence} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function BlastRadiusVisual({ assessment, evidence }: { assessment: BlastRadiusAssessment; evidence: EvidenceReference[] }) {
  const dimensions = Object.entries(assessment.dimensions) as Array<[keyof BlastRadiusAssessment["dimensions"], BlastRadiusAssessment["dimensions"][keyof BlastRadiusAssessment["dimensions"]]]>;
  return (
    <div className={styles.blastVisual} aria-label="Potential blast-radius assessment">
      <div className={styles.blastCallout}>
        <ShieldAlert aria-hidden="true" />
        <div><span>Potential blast radius</span><strong className={`${styles.level} ${styles[`level_${assessment.overall}`]}`}>{humanize(assessment.overall)}</strong></div>
        <p>Based on observed report evidence. This is not a statement of compromise or intent.</p>
      </div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <caption className="srOnly">Blast-radius dimensions and evidence</caption>
          <thead><tr><th scope="col">Dimension</th><th scope="col">Level</th><th scope="col">What the evidence supports</th><th scope="col">Evidence</th></tr></thead>
          <tbody>
            {dimensions.map(([name, item]) => (
              <tr key={name}>
                <th scope="row">{humanize(name)}</th>
                <td><span className={`${styles.level} ${styles[`level_${item.level}`]}`}>{humanize(item.level)}</span></td>
                <td><p>{item.summary}</p><small>{item.preconditions[0]}</small></td>
                <td><EvidenceRefs refs={item.evidence_refs} evidence={evidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReviewerEventChainVisual({ steps, evidence }: { steps: ReviewerGuideChainStep[]; evidence: EvidenceReference[] }) {
  if (steps.length < 2) return <div className={styles.visualEmpty}><CircleHelp aria-hidden="true" /><p>No complete trigger-to-consequence chain is available in this report.</p></div>;
  return (
    <ol className={styles.eventChain} aria-label="Validated evidence-backed event chain">
      {steps.map((step, index) => (
        <li key={step.step_id} className={styles.eventChainItem}>
          <article className={`${styles.eventStep} ${styles[`eventStep_${step.role}`]}`}>
            <span className={styles.eventRole}>{humanize(step.role)}</span>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
            <EvidenceRefs refs={step.evidence_refs} evidence={evidence} />
          </article>
          {index < steps.length - 1 ? <ArrowRight className={styles.eventArrow} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

function FlowNode({ node, evidence }: { node: DataFlowNode; evidence: EvidenceReference[] }) {
  return <div className={`${styles.flowNode} ${styles[`flowNode_${node.kind}`]}`}><div className={styles.nodeTitle}><Network aria-hidden="true" /><strong>{node.label}</strong></div><EvidenceRefs refs={node.evidence_refs} evidence={evidence} /></div>;
}

export function EvidenceRefs({ refs, evidence }: { refs: string[]; evidence: EvidenceReference[] }) {
  if (!refs.length) return <span className={styles.noRefs}>No linked evidence</span>;
  const labels = new Map(evidence.map((item) => [item.ref, item.label]));
  return <span className={styles.evidenceRefs}>{refs.slice(0, 6).map((ref) => <a href={evidenceHref(ref)} key={ref} title={labels.get(ref) || ref}><code>{shortRef(ref)}</code><ExternalLink aria-hidden="true" /></a>)}</span>;
}

function evidenceHref(ref: string): string {
  if (ref.startsWith("finding.")) return "#alerts";
  if (ref.startsWith("capability.")) return "#capabilities";
  if (ref.startsWith("dependency.")) return "#dependencies";
  if (ref.startsWith("file.")) return "#files";
  if (ref === "scan.coverage") return "#coverage";
  if (ref === "scan.baseline") return "#changes";
  if (ref === "scan.provenance") return "#provenance";
  return "#overview";
}

function shortRef(ref: string): string {
  return ref.length > 28 ? `${ref.slice(0, 25)}…` : ref;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
