"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Download,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  Printer,
  ShieldAlert,
} from "lucide-react";
import type { EvidenceIntelligenceReport, EvidenceIntelligenceTicket, IntelligenceReviewGoal } from "@/lib/evidenceIntelligence";
import { BlastRadiusVisual, EvidenceRefs, ReviewerEventChainVisual } from "./EvidenceIntelligenceVisuals";
import styles from "./evidenceIntelligence.module.css";

type GenerationState = "idle" | "loading" | "error";

const REVIEW_GOALS: Array<{ value: IntelligenceReviewGoal; label: string; description: string }> = [
  { value: "install_decision", label: "Decide whether to install", description: "Should this exact release enter your environment?" },
  { value: "flag_investigation", label: "Investigate a flagged release", description: "What evidence should explain or resolve the flag?" },
  { value: "publisher_response", label: "Respond as a publisher", description: "What needs to be addressed before resubmitting?" },
];

export default function EvidenceIntelligenceReport({
  extensionId,
  version,
  scanId,
  signedIn,
  intelligenceTicket,
}: {
  extensionId: string;
  version: string;
  scanId: string;
  signedIn: boolean;
  intelligenceTicket?: EvidenceIntelligenceTicket;
}) {
  const [reviewGoal, setReviewGoal] = useState<IntelligenceReviewGoal>("install_decision");
  const [report, setReport] = useState<EvidenceIntelligenceReport | null>(null);
  const [state, setState] = useState<GenerationState>("idle");
  const [message, setMessage] = useState("");

  async function generate() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}/scans/${encodeURIComponent(scanId)}/intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_goal: reviewGoal, depth: "standard", ...(intelligenceTicket ? { context_ticket: intelligenceTicket } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState("error");
        setMessage(String(body.error || "The reviewer guide could not be generated."));
        return;
      }
      if (!body || !["validated", "deterministic_fallback"].includes(body.validation?.status)) {
        setState("error");
        setMessage("The generated guide did not pass evidence validation and was not shown.");
        return;
      }
      setReport(body as EvidenceIntelligenceReport);
      setState("idle");
    } catch {
      setState("error");
      setMessage("The reviewer guide service is temporarily unavailable.");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="evidence-intelligence-heading">
      <div className={styles.header}>
        <div className={styles.icon} aria-hidden="true"><BrainCircuit /></div>
        <div>
          <span className={styles.eyebrow}>Reviewer guide</span>
          <h2 id="evidence-intelligence-heading">Know what this exact release means for your next decision.</h2>
          <p>Reads the structured report for this artifact and returns a short, cited guide: the one thing to know, what could happen if the behavior runs, and what to verify next.</p>
        </div>
      </div>
      {!signedIn ? (
        <div className={styles.signIn}>
          <ShieldAlert aria-hidden="true" />
          <p><strong>Sign in to generate the reviewer guide.</strong> Generation is authenticated and quota-controlled because a bounded copy of the structured report is sent to Sarvam.</p>
          <Link href="/account">Sign in <ArrowRight aria-hidden="true" /></Link>
        </div>
      ) : (
        <div className={styles.controls}>
          <label>
            <span>What are you trying to decide?</span>
            <select value={reviewGoal} onChange={(event) => setReviewGoal(event.target.value as IntelligenceReviewGoal)} disabled={state === "loading"}>
              {REVIEW_GOALS.map((goal) => <option value={goal.value} key={goal.value}>{goal.label}</option>)}
            </select>
          </label>
          <p className={styles.goalHint}>{REVIEW_GOALS.find((goal) => goal.value === reviewGoal)?.description}</p>
          <button type="button" onClick={() => void generate()} disabled={state === "loading"}>
            {state === "loading" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <BrainCircuit aria-hidden="true" />}
            {state === "loading" ? "Reading exact evidence…" : report ? "Generate again" : "Generate reviewer guide"}
          </button>
          <details className={styles.dataDisclosure}><summary>What leaves Abscissa?</summary><p>Only bounded, redacted report facts: identity, decision metadata, capabilities, finding summaries, file references, dependency names and advisory counts, coverage, and normalized impact inputs. Raw source, README text, credentials, advisory payloads, and hidden reasoning are excluded.</p></details>
        </div>
      )}
      {state === "error" ? <p className={styles.error} role="alert">{message}</p> : null}
      {report ? <ReportResult report={report} /> : null}
    </section>
  );
}

function ReportResult({ report }: { report: EvidenceIntelligenceReport }) {
  const guide = report.guide;
  const isFallback = report.validation.status === "deterministic_fallback";
  const affectedSurfaces = report.access_surface.slice(0, 5);
  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guardrails-review-guide-${safeFilePart(report.identity.extension_id)}-${safeFilePart(report.identity.version)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={styles.result}>
      <div className={styles.hero}>
        <span className={`${styles.validated} ${isFallback ? styles.fallback : ""}`}><BadgeCheck aria-hidden="true" /> {isFallback ? "Deterministic review summary — AI interpretation unavailable" : "Sarvam reviewer guide · evidence validated"}</span>
        <span className={styles.goalLabel}>{goalLabel(report.review_goal)}</span>
        <h3>What you need to know</h3>
        <div className={styles.primaryCard}>
          <div className={styles.primaryHeader}><span className={styles.sectionEyebrow}>Primary takeaway</span><span className={styles.certainty}>{humanize(guide.primary_takeaway.certainty)}</span></div>
          <h4>{guide.primary_takeaway.title}</h4>
          <p className={styles.primaryStatement}>{guide.primary_takeaway.statement}</p>
          <div className={styles.primaryAction}><ArrowRight aria-hidden="true" /><span><strong>Next:</strong> {guide.primary_takeaway.action}</span></div>
          <EvidenceRefs refs={guide.primary_takeaway.evidence_refs} evidence={report.evidence} />
        </div>
      </div>

      <dl className={styles.facts} aria-label="Exact release proof rail">
        <div><dt>Exact release</dt><dd>{report.identity.extension_id}@{report.identity.version}</dd></div>
        <div><dt>Artifact hash</dt><dd><code>{shortHash(report.identity.artifact_sha256)}</code></dd></div>
        <div><dt>Scan decision</dt><dd>{report.deterministic.decision.toUpperCase()}</dd></div>
        <div><dt>Potential impact</dt><dd>{humanize(report.blast_radius.overall)}</dd></div>
      </dl>

      {affectedSurfaces.length ? <section className={styles.surfaceRail} aria-label="Observed affected surfaces">
        <span className={styles.sectionEyebrow}>Observed surfaces</span>
        <div>{affectedSurfaces.map((entry) => <span className={styles.surfaceChip} key={entry.id}><a href={surfaceHref(entry.id)}>{entry.asset_label}</a><EvidenceRefs refs={entry.evidence_refs.slice(0, 1)} evidence={report.evidence} /></span>)}</div>
      </section> : null}

      {guide.event_chain.available ? <section className={styles.reportSection}>
        <SectionHeader eyebrow="Evidence chain" title="What connects to what" detail="Shown only when the report contains structured trigger, action, and target or consequence evidence." />
        <ReviewerEventChainVisual steps={guide.event_chain.steps} evidence={report.evidence} />
      </section> : <section className={styles.compactNotice}><FileSearch aria-hidden="true" /><p><strong>No complete causal chain was reconstructed.</strong> {guide.event_chain.unavailable_reason}</p><EvidenceRefs refs={guide.event_chain.evidence_refs} evidence={report.evidence} /></section>}

      {guide.scenarios.length ? <section className={styles.reportSection}>
        <SectionHeader eyebrow="If this behavior runs" title="What could be affected" detail="Conditional scenarios, not claims of intent or confirmed harm." />
        <div className={styles.scenarioGrid}>{guide.scenarios.map((scenario) => <article className={styles.scenario} key={scenario.scenario_id}>
          <div className={styles.scenarioTop}><h4>{scenario.title}</h4><span className={styles.certainty}>{humanize(scenario.certainty)}</span></div>
          <dl><div><dt>When</dt><dd>{scenario.when}</dd></div><div><dt>Mechanism</dt><dd>{scenario.mechanism}</dd></div><div><dt>Could affect</dt><dd>{scenario.affected_surface}</dd></div><div><dt>Not established</dt><dd>{scenario.consequence}</dd></div></dl>
          <EvidenceRefs refs={scenario.evidence_refs} evidence={report.evidence} />
        </article>)}</div>
      </section> : null}

      {guide.release_changes.length ? <section className={styles.reportSection}>
        <SectionHeader eyebrow="Release comparison" title="What changed in this version" detail={`Compared with ${report.release_delta.baseline_version || "the recorded baseline"}.`} />
        <ul className={styles.compactList}>{guide.release_changes.map((change) => <li key={change.change_id}><span>{change.text}</span><EvidenceRefs refs={change.evidence_refs} evidence={report.evidence} /></li>)}</ul>
      </section> : null}

      {guide.next_actions.length ? <section className={styles.reportSection}>
        <SectionHeader eyebrow="Decision support" title="What you should do next" />
        <ol className={styles.actionList}>{guide.next_actions.map((action) => <li key={action.action_id}><div className={styles.actionMeta}><span className={styles.priority}>{humanize(action.priority)}</span><span>{humanize(action.owner)}</span></div><p>{action.text}</p><EvidenceRefs refs={action.evidence_refs} evidence={report.evidence} /></li>)}</ol>
      </section> : null}

      {guide.unknowns.length ? <section className={styles.reportSection}>
        <SectionHeader eyebrow="Open questions" title="What remains unknown" detail="These are the gaps that can change the decision." />
        <div className={styles.unknownList}>{guide.unknowns.map((unknown) => <article key={unknown.unknown_id}><h4>{unknown.question}</h4><p>{unknown.why_it_matters}</p><EvidenceRefs refs={unknown.evidence_refs} evidence={report.evidence} /></article>)}</div>
      </section> : null}

      <details className={styles.proofDisclosure} id="scan-proof">
        <summary><span>Open scan proof</span><small>Exact deterministic surfaces, impact dimensions, coverage, and evidence catalog</small></summary>
        <section className={styles.reportSection}>
          <SectionHeader eyebrow="Deterministic proof" title="What the scanner recorded access to" detail="Capability describes power and scope, not intent." />
          {report.access_surface.length ? <div className={styles.accessGrid}>{report.access_surface.map((entry) => <article className={styles.accessEntry} key={entry.id}>
            <div className={styles.accessTop}><strong>{entry.asset_label}</strong><span className={styles.status}>{humanize(entry.status)}</span></div>
            <p>{entry.operation}</p>
            <div className={styles.accessMeta}><span>Scope</span><small>{entry.scope}</small></div>
            <div className={styles.accessMeta}><span>Precondition</span><small>{entry.preconditions[0]}</small></div>
            <EvidenceRefs refs={entry.evidence_refs} evidence={report.evidence} />
          </article>)}</div> : <div className={styles.unknownBand}><p>No classified access capability was recorded. That is not proof that no access exists.</p></div>}
        </section>
        <section className={styles.reportSection}>
          <SectionHeader eyebrow="Deterministic proof" title="Impact dimensions" detail="A bounded view of what could be affected if an observed capability is exercised." />
          <BlastRadiusVisual assessment={report.blast_radius} evidence={report.evidence} />
        </section>
        <section className={styles.reportSection}>
          <SectionHeader eyebrow="Coverage boundary" title="What this report does not establish" />
          <div className={styles.unknownBand}><ul>{report.coverage_boundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}</ul>{report.omitted_fields.length ? <small className={styles.omitted}>Context exclusions: {report.omitted_fields.join(" · ")}</small> : null}</div>
        </section>
        <section className={styles.reportSection}>
          <SectionHeader eyebrow="Evidence catalog" title="Trace the guide to its source" detail={`${report.evidence.length} exact references · context ${shortHash(report.context_digest)}`} />
          <div className={styles.claimList}>{report.evidence.slice(0, 40).map((item) => <div className={styles.claim} key={item.ref}><span className={styles.claimMark} aria-hidden="true" /><div className={styles.claimText}><strong>{item.ref}</strong><span>{item.label} — {item.detail}</span></div></div>)}</div>
        </section>
      </details>

      <div className={styles.actions}>
        <button type="button" onClick={downloadReport}><Download aria-hidden="true" /> Download JSON</button>
        <button type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Print / save PDF</button>
        <span><LockKeyhole aria-hidden="true" /> {report.model} · {formatDate(report.generated_at)}</span>
      </div>
      <p className={styles.disclosure}>The exact artifact, deterministic analyzers, evidence coverage, and human/team decision remain authoritative. The guide does not establish intent, exploitability, compromise, or actual data exfiltration unless separately evidenced by the deterministic report.</p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className={styles.sectionHeader}><div><span className={styles.sectionEyebrow}>{eyebrow}</span><h4>{title}</h4></div>{detail ? <p>{detail}</p> : null}</div>;
}

function goalLabel(goal: IntelligenceReviewGoal): string {
  return REVIEW_GOALS.find((item) => item.value === goal)?.label || "Review goal";
}

function surfaceHref(id: string): string {
  if (id === "supply_chain") return "#dependencies";
  if (id === "external_services") return "#overview";
  return "#capabilities";
}

function shortHash(value: string): string {
  if (!value) return "not recorded";
  return value.length > 18 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "report";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "generated time unavailable";
}
