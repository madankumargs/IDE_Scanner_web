"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Download,
  LoaderCircle,
  LockKeyhole,
  Printer,
  ShieldAlert,
} from "lucide-react";
import type { EvidenceIntelligenceReport, IntelligenceAudience, IntelligenceClaim } from "@/lib/evidenceIntelligence";
import { BlastRadiusVisual, EvidenceFlowVisual, EvidenceRefs } from "./EvidenceIntelligenceVisuals";
import styles from "./evidenceIntelligence.module.css";

type GenerationState = "idle" | "loading" | "error";

export default function EvidenceIntelligenceReport({
  extensionId,
  version,
  scanId,
  signedIn,
}: {
  extensionId: string;
  version: string;
  scanId: string;
  signedIn: boolean;
}) {
  const [audience, setAudience] = useState<IntelligenceAudience>("security_lead");
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
        body: JSON.stringify({ audience, depth: "standard" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState("error");
        setMessage(String(body.error || "The evidence intelligence report could not be generated."));
        return;
      }
      if (!body || body.validation?.status !== "validated") {
        setState("error");
        setMessage("The generated report did not pass evidence validation and was not shown.");
        return;
      }
      setReport(body as EvidenceIntelligenceReport);
      setState("idle");
    } catch {
      setState("error");
      setMessage("The evidence intelligence service is temporarily unavailable.");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="evidence-intelligence-heading">
      <div className={styles.header}>
        <div className={styles.icon} aria-hidden="true"><BrainCircuit /></div>
        <div>
          <span className={styles.eyebrow}>Evidence intelligence</span>
          <h2 id="evidence-intelligence-heading">Understand the access surface and potential blast radius.</h2>
          <p>Reads the structured evidence for this exact artifact, then produces a cited security interpretation. It cannot change the GuardRails decision.</p>
        </div>
      </div>
      {!signedIn ? (
        <div className={styles.signIn}>
          <ShieldAlert aria-hidden="true" />
          <p><strong>Sign in to generate the intelligence report.</strong> Generation is authenticated and quota-controlled because a bounded copy of the structured report is sent to Sarvam.</p>
          <Link href="/account">Sign in <ArrowRight aria-hidden="true" /></Link>
        </div>
      ) : (
        <div className={styles.controls}>
          <label>
            <span>Review lens</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value as IntelligenceAudience)} disabled={state === "loading"}>
              <option value="security_lead">Security lead</option>
              <option value="engineer">Engineering reviewer</option>
              <option value="publisher">Publisher response</option>
            </select>
          </label>
          <button type="button" onClick={() => void generate()} disabled={state === "loading"}>
            {state === "loading" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <BrainCircuit aria-hidden="true" />}
            {state === "loading" ? "Reading exact evidence…" : report ? "Regenerate report" : "Generate intelligence report"}
          </button>
          <details className={styles.dataDisclosure}><summary>What leaves Abscissa?</summary><p>Only bounded, redacted report facts: identity, decision metadata, capabilities, finding summaries, file references, dependency names and advisory counts, coverage, and normalized blast-radius inputs. Raw source, README text, credentials, advisory payloads, and hidden reasoning are excluded.</p></details>
        </div>
      )}
      {state === "error" ? <p className={styles.error} role="alert">{message}</p> : null}
      {report ? <ReportResult report={report} /> : null}
    </section>
  );
}

function ReportResult({ report }: { report: EvidenceIntelligenceReport }) {
  const claimsBySection = new Map<string, IntelligenceClaim[]>();
  for (const claim of report.narrative.claims) claimsBySection.set(claim.section, [...(claimsBySection.get(claim.section) || []), claim]);
  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guardrails-intelligence-${safeFilePart(report.identity.extension_id)}-${safeFilePart(report.identity.version)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={styles.result}>
      <div className={styles.hero}>
        <span className={styles.validated}><BadgeCheck aria-hidden="true" /> Validated evidence interpretation</span>
        <h3>{report.narrative.headline}</h3>
        <p className={styles.bottomLine}>{report.narrative.bottom_line}</p>
        <div className={styles.summaryRefs}><span>Summary evidence</span><EvidenceRefs refs={report.narrative.summary_evidence_refs} evidence={report.evidence} /></div>
      </div>

      <dl className={styles.facts} aria-label="Intelligence report identity and status">
        <div><dt>Exact release</dt><dd>{report.identity.extension_id}@{report.identity.version}</dd></div>
        <div><dt>Artifact hash</dt><dd><code>{shortHash(report.identity.artifact_sha256)}</code></dd></div>
        <div><dt>Decision remains</dt><dd>{report.deterministic.decision.toUpperCase()}</dd></div>
        <div><dt>Potential blast radius</dt><dd>{humanize(report.blast_radius.overall)}</dd></div>
      </dl>

      <section className={styles.reportSection}>
        <SectionHeader eyebrow="Access surface" title="What this extension can access" detail="Deterministic capability mapping. Capability describes power, not intent." />
        {report.access_surface.length ? <div className={styles.accessGrid}>{report.access_surface.map((entry) => <article className={styles.accessEntry} key={entry.id}>
          <div className={styles.accessTop}><strong>{entry.asset_label}</strong><span className={styles.status}>{humanize(entry.status)}</span></div>
          <p>{entry.operation}</p>
          <div className={styles.accessMeta}><span>Scope</span><small>{entry.scope}</small></div>
          <div className={styles.accessMeta}><span>Precondition</span><small>{entry.preconditions[0]}</small></div>
          <EvidenceRefs refs={entry.evidence_refs} evidence={report.evidence} />
        </article>)}</div> : <div className={styles.unknownBand}><p>No classified access capability was recorded. This is not proof that no access exists; see coverage and unknowns below.</p></div>}
      </section>

      <section className={styles.reportSection}>
        <SectionHeader eyebrow="Visual evidence" title="How the evidence connects" detail="These visuals are rendered by GuardRails from validated graph data, not generated markup." />
        <EvidenceFlowVisual nodes={report.data_flow.nodes} edges={report.data_flow.edges} evidence={report.evidence} />
      </section>

      <section className={styles.reportSection}>
        <SectionHeader eyebrow="Potential impact" title="Blast-radius assessment" detail="A bounded view of what could be affected if the observed behavior is exercised." />
        <BlastRadiusVisual assessment={report.blast_radius} evidence={report.evidence} />
      </section>

      <NarrativeSection title="What the evidence shows" claims={[...(claimsBySection.get("decision") || []), ...(claimsBySection.get("access_surface") || []), ...(claimsBySection.get("data_flow") || [])]} evidence={report.evidence} />
      <NarrativeSection title="Why a reviewer should care" claims={[...(claimsBySection.get("blast_radius") || [])]} evidence={report.evidence} />
      <NarrativeSection title="What changed" claims={[...(claimsBySection.get("release_delta") || [])]} evidence={report.evidence} quiet={!report.release_delta.available} />
      <NarrativeSection title="Positive signals" claims={report.narrative.positive_signals} evidence={report.evidence} quiet />
      <NarrativeSection title="Verify next" actions={report.narrative.verify_next} evidence={report.evidence} />
      <NarrativeSection title="Unknowns and limits" claims={report.narrative.unknowns} evidence={report.evidence} quiet />

      <section className={styles.reportSection}>
        <SectionHeader eyebrow="Coverage boundary" title="What this report does not establish" detail="Honest interpretation requires keeping missing evidence visible." />
        <div className={styles.unknownBand}>
          <ul>{report.coverage_boundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}</ul>
          {report.omitted_fields.length ? <small className={styles.omitted}>Context exclusions: {report.omitted_fields.join(" · ")}</small> : null}
        </div>
      </section>

      <section className={styles.reportSection}>
        <SectionHeader eyebrow="Evidence catalog" title="Trace every conclusion to the report" detail={`${report.evidence.length} references available · context digest ${shortHash(report.context_digest)}`} />
        <div className={styles.claimList}>{report.evidence.slice(0, 40).map((item) => <div className={styles.claim} key={item.ref}><span className={styles.claimMark} aria-hidden="true" /><div className={styles.claimText}><strong>{item.ref}</strong><span>{item.label} — {item.detail}</span></div></div>)}</div>
      </section>

      <div className={styles.actions}>
        <button type="button" onClick={downloadReport}><Download aria-hidden="true" /> Download JSON</button>
        <button type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Print / save PDF</button>
        <span><LockKeyhole aria-hidden="true" /> {report.model} · {report.audience} · {formatDate(report.generated_at)}</span>
      </div>
      <p className={styles.disclosure}>AI-generated decision support. The exact artifact, deterministic analyzers, evidence coverage, and human/team decision remain authoritative. This report does not establish intent, exploitability, compromise, or actual data exfiltration unless separately evidenced by the deterministic report.</p>
    </div>
  );
}

function NarrativeSection({ title, claims = [], actions = [], evidence, quiet = false }: { title: string; claims?: IntelligenceClaim[]; actions?: Array<{ text: string; evidence_refs: string[] }>; evidence: EvidenceIntelligenceReport["evidence"]; quiet?: boolean }) {
  if (!claims.length && !actions.length) return null;
  return <section className={`${styles.reportSection} ${quiet ? styles.quiet : ""}`}><SectionHeader eyebrow="Cited interpretation" title={title} /><div className={styles.claimList}>{claims.map((claim) => <Claim key={claim.claim_id} claim={claim} evidence={evidence} />)}{actions.map((action, index) => <div className={styles.claim} key={`${action.text}-${index}`}><span className={styles.claimMark} aria-hidden="true" /><div className={styles.claimText}><span>{action.text}</span><div className={styles.claimRefs}><EvidenceRefs refs={action.evidence_refs} evidence={evidence} /></div></div></div>)}</div></section>;
}

function Claim({ claim, evidence }: { claim: IntelligenceClaim; evidence: EvidenceIntelligenceReport["evidence"] }) {
  return <div className={styles.claim}><span className={styles.claimMark} aria-hidden="true" /><div className={styles.claimText}><strong>{humanize(claim.certainty)}</strong><span>{claim.text}</span><div className={styles.claimRefs}><EvidenceRefs refs={claim.evidence_refs} evidence={evidence} /></div></div></div>;
}

function SectionHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className={styles.sectionHeader}><div><span className={styles.sectionEyebrow}>{eyebrow}</span><h4>{title}</h4></div>{detail ? <p>{detail}</p> : null}</div>;
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
