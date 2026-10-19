import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, FileCode2, GitCommitHorizontal, ShieldAlert, Waypoints } from "lucide-react";
import Link from "next/link";
import { skillAnalyzers, skillDetectionMatrix, skillDimensions } from "@/lib/skillsMatrix";
import SkillsCatalogClient from "@/app/skills/SkillsCatalogClient";
import SkillsScanClient from "@/app/skills/SkillsScanClient";
import styles from "./skills.module.css";

export const metadata: Metadata = {
  title: "Skills Scanning",
  description: "Inspect public agent Skills with exact source identity, decision metrics, and a dedicated detection matrix.",
  alternates: { canonical: "/skills" },
};

export default function SkillsPage() {
  const groups = [...new Set(skillDetectionMatrix.map((rule) => rule.analyzer))];
  return <main className={styles.page}>
    <section className={styles.hero}><div><span className={styles.eyebrow}><i/> Public Skills intelligence</span><h1>Review what an agent Skill can make happen.</h1><p>Skills are instruction bundles, not extension packages. GuardRails keeps their source identity, instruction layer, scripts, dependencies, and provenance visible before they are trusted.</p><div className={styles.actions}><Link className={styles.primary} href="/registry"><ArrowRight/> Back to registry</Link><Link className={styles.secondary} href="/research">Read the evidence boundary <ArrowRight/></Link></div></div><aside className={styles.identity}><div><GitCommitHorizontal/><span>Exact source</span><strong>Commit-pinned</strong></div><div><FileCode2/><span>Required analyzers</span><strong>6 + optional probe</strong></div><div><ShieldAlert/><span>Default decision</span><strong>Incomplete if coverage is missing</strong></div></aside></section>
    <section className={styles.metricGrid} aria-label="Skills decision metrics"><div><span>Decision states</span><strong>4</strong><small>allow · review · block · incomplete</small></div><div><span>Detection rules</span><strong>{skillDetectionMatrix.length}</strong><small>SK-prefixed rules in this release</small></div><div><span>Risk dimensions</span><strong>{skillDimensions.length}</strong><small>weighted evidence dimensions</small></div><div><span>Execution boundary</span><strong>Static only</strong><small>never execute untrusted code on the web host</small></div></section>
    <SkillsCatalogClient/>
    <SkillsScanClient/>
    <section className={styles.decision}><header><span className={styles.eyebrow}><i/> Decision matrix</span><h2>Evidence decides the state, not popularity.</h2><p>Skills use the same GuardRails discipline as extension reports—immutable identity, evidence classes, coverage gates, and explicit uncertainty—but their detectors are specific to instruction bundles.</p></header><div className={styles.decisionGrid}><article><strong>BLOCK</strong><p>Authoritative malicious intelligence, or malware evidence at the critical threshold.</p></article><article><strong>INCOMPLETE</strong><p>Any required analyzer is missing. No missing coverage becomes an approval.</p></article><article><strong>REVIEW</strong><p>Corroborated behavior, meaningful risk, or a provenance concern needs human context.</p></article><article><strong>ALLOW</strong><p>Required analysis completed with no policy-relevant finding.</p></article></div></section>
    <section className={styles.matrix}><header><div><span className={styles.eyebrow}><i/> Detection matrix</span><h2>Different artifact. Different rules.</h2></div><p>{groups.length} analyzer surfaces · {skillDetectionMatrix.length} typed rules · capabilities remain distinct from malware claims.</p></header><div className={styles.tableWrap}><table><caption className={styles.srOnly}>Skills detection rules</caption><thead><tr><th>Rule</th><th>Detects</th><th>Analyzer</th><th>Method</th><th>Severity</th><th>Dimension</th></tr></thead><tbody>{skillDetectionMatrix.map((rule)=><tr key={rule.id}><td><code>{rule.id}</code></td><td>{rule.title}</td><td>{rule.analyzer}</td><td>{rule.method}</td><td><span className={`${styles.severity} ${styles[rule.severity.toLowerCase()]}`}>{rule.severity}</span></td><td>{rule.dimension.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></section>
    <section className={styles.analyzers}><header><span className={styles.eyebrow}><i/> Coverage contract</span><h2>Every required surface stays visible.</h2></header><div className={styles.analyzerGrid}>{skillAnalyzers.map((analyzer)=><article key={analyzer.id}><CheckCircle2/><div><strong>{analyzer.label}</strong><small>{analyzer.required ? `Required · weight ${analyzer.weight}` : "Optional · never hides a failed required check"}</small></div></article>)}</div></section>
    <section className={styles.notice}><Waypoints/><div><strong>Skills scanning is intentionally separate from Extension Registry analysis.</strong><p>Source acquisition and static detection attach only to this surface. Extension detection and decisions remain unchanged; untrusted Skill code is never executed by this web scanner.</p></div><Link href="/registry">Choose another registry path <ArrowRight/></Link></section>
  </main>;
}
