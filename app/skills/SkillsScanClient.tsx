"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, ArrowUpRight, FileSearch, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { SkillScanReport } from "@/lib/skillsScanner";
import { skillDecisionLabel, skillDecisionReason, skillNextStep, skillReportIdentity } from "@/lib/skillsReportPresentation";
import { saveSkillReport } from "./skillsReportStorage";
import styles from "./skills.module.css";

type ErrorPayload = { error?: string };

export default function SkillsScanClient() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [report, setReport] = useState<SkillScanReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/skills/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_url: sourceUrl }) });
      const payload = (await response.json()) as SkillScanReport & ErrorPayload;
      if (!response.ok) throw new Error(payload.error || "The Skill could not be scanned.");
      saveSkillReport(payload);
      setReport(payload);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The Skill could not be scanned.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.scanPanel} aria-labelledby="live-scan-heading">
    <div className={styles.scanIntro}>
      <span className={styles.eyebrow}><i/> Live public-source scan</span>
      <h2 id="live-scan-heading">Pin a public Skill, then inspect its evidence.</h2>
      <p>Paste a GitHub repository, tree, or SKILL.md URL. The scanner resolves it to a commit, fetches only a bounded Skill tree, and reports what it could and could not verify.</p>
    </div>
    <form className={styles.scanForm} onSubmit={submit}>
      <label htmlFor="skill-source-url">Public GitHub Skill URL</label>
      <div className={styles.scanInputRow}><input id="skill-source-url" type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://github.com/org/repo/tree/main/path/to/skill" autoComplete="off"/><button type="submit" disabled={busy}>{busy ? <><LoaderCircle className={styles.spin}/> Scanning</> : <><FileSearch/> Scan Skill</>}</button></div>
      <small>Read-only source acquisition · commit pinned · no scripts or install hooks executed</small>
    </form>
    {error && <div className={styles.scanError} role="alert"><TriangleAlert/><span>{error}</span></div>}
    {report && <SkillsQuickReport report={report}/>} 
  </section>;
}

function SkillsQuickReport({ report }: { report: SkillScanReport }) {
  return <div className={styles.scanResult}>
    <header className={styles.resultHeader}><div><span className={styles.eyebrow}><i/> Quick report</span><h3>{skillReportIdentity(report)}<span>Exact public snapshot · commit {report.source.commit.slice(0, 12)}</span></h3></div><span className={`${styles.resultState} ${styles[report.decision]}`}>{report.decision}</span></header>
    <div className={styles.resultStats}><div><span>Risk</span><strong>{report.scores.risk.toFixed(1)}</strong></div><div><span>Malware score</span><strong>{report.scores.malware.toFixed(1)}</strong></div><div><span>Coverage</span><strong>{report.coverage.completedRequired}/{report.coverage.requiredAnalyzers}</strong></div><div><span>Findings</span><strong>{report.findings.length}</strong></div></div>
    <section className={styles.quickQuestions} aria-label="Skills quick report"><article><span>What did GuardRails decide?</span><strong>{skillDecisionLabel(report.decision)}</strong><p>{skillDecisionReason(report)}</p></article><article><span>Why did it decide that?</span><strong>{report.findings.length ? `${report.findings.length} detection${report.findings.length === 1 ? "" : "s"} recorded` : "No configured detection fired"}</strong><p>Risk is {report.scores.risk.toFixed(1)} and required coverage is {report.coverage.completedRequired}/{report.coverage.requiredAnalyzers}. The detailed report explains every rule and limitation.</p></article><article><span>What should I do next?</span><strong>{skillNextStep(report)}</strong><p>The result is bound to this commit and content hash; it does not approve future changes.</p></article></section>
    <div className={styles.sourceProof}><div><span>Resolved commit</span><a href={report.source.commitUrl} target="_blank" rel="noreferrer"><code>{report.source.commit.slice(0, 12)}</code><ArrowUpRight/></a></div><div><span>Immutable content hash</span><code>{report.artifact.contentHash.slice(0, 20)}…</code></div><div><span>Files</span><strong>{report.artifact.fetchedFileCount}/{report.artifact.fileCount}</strong></div></div>
    {report.limitations.length > 0 && <div className={styles.quickLimitation}><TriangleAlert/><span>{report.limitations[0]}{report.limitations.length > 1 ? ` + ${report.limitations.length - 1} more limitation${report.limitations.length === 2 ? "" : "s"}.` : ""}</span></div>}
    <div className={styles.quickActions}><Link className={styles.primary} href="/skills/report">Open full report <ArrowRight/></Link><span>Sign in unlocks the detailed evidence ledger.</span></div>
  </div>;
}
