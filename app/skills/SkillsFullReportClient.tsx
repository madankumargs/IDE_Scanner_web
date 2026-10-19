"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileSearch, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import type { SkillScanReport } from "@/lib/skillsScanner";
import { skillDecisionLabel, skillDecisionReason, skillNextStep, skillReportIdentity } from "@/lib/skillsReportPresentation";
import { loadSkillReport } from "./skillsReportStorage";
import styles from "./skills.module.css";

type SessionPayload = { user?: { id?: string } | null };

export default function SkillsFullReportClient() {
  const [report, setReport] = useState<SkillScanReport | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReport(loadSkillReport()));
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json() as Promise<SessionPayload>)
      .then((payload) => setSignedIn(Boolean(payload.user?.id)))
      .catch(() => setSignedIn(false));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!report) {
    return <main className={styles.reportPage}><Link className={styles.reportBack} href="/skills"><ArrowRight className={styles.backIcon}/> Back to Skills scan</Link><section className={styles.reportEmpty}><FileSearch/><span className={styles.eyebrow}><i/> No report in this browser</span><h1>Run a Skills scan first.</h1><p>The detailed report stays tied to the exact public snapshot you just scanned. Start a scan to create that handoff.</p><Link className={styles.primary} href="/skills">Open Skills scanning <ArrowRight/></Link></section></main>;
  }

  if (signedIn === null) {
    return <main className={styles.reportPage}><section className={styles.reportLoading} aria-live="polite">Checking report access…</section></main>;
  }

  if (!signedIn) return <SkillsSignInGate report={report}/>;
  return <SkillsDetailedReport report={report}/>;
}

function SkillsSignInGate({ report }: { report: SkillScanReport }) {
  const accountHref = `/account?next=${encodeURIComponent("/skills/report")}`;
  return <main className={styles.reportPage}>
    <Link className={styles.reportBack} href="/skills"><ArrowRight className={styles.backIcon}/> Back to Quick Report</Link>
    <section className={styles.reportIdentity}><div><span className={styles.eyebrow}><i/> Full Skills report</span><h1>{skillReportIdentity(report)}</h1><p>Commit <code>{report.source.commit.slice(0, 12)}</code> · {report.source.skillPath || "root Skill"}</p></div><div className={styles.locked}><LockKeyhole/><span>Technical evidence is available after sign-in.</span></div></section>
    <section className={`${styles.reportDecision} ${styles[report.decision]}`}><span>What did GuardRails decide?</span><h2>{skillDecisionLabel(report.decision)}</h2><p>{skillDecisionReason(report)}</p></section>
    <section className={styles.reportQuestions} aria-label="Full Skills report access"><div><span>Why this result?</span><strong>{skillDecisionReason(report)}</strong></div><div><span>What will the full report add?</span><strong>Detection rule IDs, exact file locations, evidence classes, analyzer coverage, limitations, and the immutable content hash.</strong></div><div><span>What should I do next?</span><strong>{skillNextStep(report)}</strong></div></section>
    <section className={styles.reportProof}><div><span>Evidence preview</span><h2>Continue with the same exact-snapshot decision.</h2><p>Signing in unlocks the detailed report without changing the decision or rescanning a mutable source.</p></div><dl><div><dt>Resolved commit</dt><dd><a href={report.source.commitUrl} target="_blank" rel="noreferrer"><code>{report.source.commit.slice(0, 12)}</code><ArrowUpRight/></a></dd></div><div><dt>Content hash</dt><dd><code>{report.artifact.contentHash.slice(0, 16)}…</code></dd></div><div><dt>Coverage</dt><dd>{report.coverage.completedRequired}/{report.coverage.requiredAnalyzers} required</dd></div><div><dt>Findings</dt><dd>{report.findings.length}</dd></div></dl></section>
    <div className={styles.reportActions}><Link className={styles.primary} href={accountHref}>Sign in to continue <ArrowRight/></Link><Link className={styles.secondary} href="/skills">Return to scan</Link></div>
  </main>;
}

function SkillsDetailedReport({ report }: { report: SkillScanReport }) {
  return <main className={styles.reportPage}>
    <Link className={styles.reportBack} href="/skills"><ArrowRight className={styles.backIcon}/> Back to Skills scan</Link>
    <section className={styles.reportIdentity}><div><span className={styles.eyebrow}><i/> Detailed Skills report</span><h1>{skillReportIdentity(report)}</h1><p>Exact public snapshot · <code>{report.source.commit.slice(0, 12)}</code></p></div><span className={styles.signedIn}>Signed-in report</span></section>
    <section className={`${styles.reportDecision} ${styles[report.decision]}`}><span>What did GuardRails decide?</span><h2>{skillDecisionLabel(report.decision)}</h2><p>{skillDecisionReason(report)}</p></section>
    <div className={styles.resultStats}><div><span>Risk</span><strong>{report.scores.risk.toFixed(1)}</strong></div><div><span>Malware score</span><strong>{report.scores.malware.toFixed(1)}</strong></div><div><span>Coverage</span><strong>{report.coverage.completedRequired}/{report.coverage.requiredAnalyzers}</strong></div><div><span>Findings</span><strong>{report.findings.length}</strong></div></div>
    <div className={styles.sourceProof}><div><span>Resolved commit</span><a href={report.source.commitUrl} target="_blank" rel="noreferrer"><code>{report.source.commit.slice(0, 12)}</code><ArrowUpRight/></a></div><div><span>Immutable content hash</span><code>{report.artifact.contentHash.slice(0, 20)}…</code></div><div><span>Files</span><strong>{report.artifact.fetchedFileCount}/{report.artifact.fileCount}</strong></div></div>
    {report.limitations.length > 0 && <div className={styles.limitations}><TriangleAlert/><div><strong>Coverage limitations</strong><ul>{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div></div>}
    <section className={styles.reportQuestions} aria-label="Detailed report guidance"><div><span>Why this result?</span><strong>{skillDecisionReason(report)}</strong></div><div><span>What should I do next?</span><strong>{skillNextStep(report)}</strong></div><div><span>What is this report bound to?</span><strong>{report.source.owner}/{report.source.repo} at commit {report.source.commit.slice(0, 12)} with content hash {report.artifact.contentHash.slice(0, 12)}…</strong></div></section>
    <section className={styles.findings}><div className={styles.findingsHeader}><div><span className={styles.eyebrow}><i/> Evidence ledger</span><h3>Detections from this snapshot</h3></div><span>{report.findings.length ? "Review each rule before trust" : "No rule fired"}</span></div>{report.findings.length ? <div className={styles.findingList}>{report.findings.map((finding, index) => <article key={`${finding.ruleId || finding.title}-${finding.file}-${finding.line}-${index}`}><div className={styles.findingTop}><code>{finding.ruleId || "SK"}</code><span className={`${styles.severity} ${styles[finding.severity.toLowerCase()]}`}>{finding.severity}</span><span>{finding.evidenceClass}</span></div><strong>{finding.title}</strong><p>{finding.explanation}</p>{finding.file && <small>{finding.file}{finding.line ? `:${finding.line}` : ""}{finding.snippet ? ` — ${finding.snippet}` : ""}</small>}</article>)}</div> : <div className={styles.noFindings}><ShieldCheck/><p>No configured detection fired in the fetched snapshot. This is not an intelligence-backed approval while required coverage is incomplete.</p></div>}</section>
  </main>;
}
