import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSearch, ShieldCheck, SquareStack, TriangleAlert } from "lucide-react";
import styles from "../docs/docs.module.css";

const VSIX_AUDIT_URL = "https://github.com/trailofbits/vsix-audit";

export const metadata: Metadata = {
  title: "GuardRails and vsix-audit | VS Code Extension Security",
  description:
    "Choose vsix-audit for an independent local VSIX scan. Choose GuardRails for published exact-release evidence, release monitoring, workspace governance, and read-only AI-assisted review.",
  keywords: ["GuardRails vs vsix-audit", "scan VSIX", "VS Code extension security", "extension release monitoring", "VS Code extension governance"],
  alternates: { canonical: "/vsix-audit" },
  openGraph: {
    title: "GuardRails and vsix-audit: choose the right VSIX security boundary",
    description: "A factual comparison of local VSIX inspection and release-specific evidence, monitoring, and governance.",
    url: "/vsix-audit",
  },
};

const comparison = [
  ["Primary boundary", "A local downloaded .vsix package", "A published extension release and its evidence record"],
  ["Best starting point", "Independent pre-install inspection of a file you control", "Reviewing a marketplace release, monitoring future changes, or recording a team decision"],
  ["Evidence record", "Local CLI findings for the package scanned", "Exact-release report with artifact identity, coverage, findings, decision boundary, and user-openable evidence"],
  ["Ongoing review", "Run another scan when you choose", "Release monitoring, workspace inventory, policies, decisions, alerts, and audit history"],
  ["AI workflow", "Use its CLI output in your review process", "Read-only MCP resources, prompts, public evidence tools, and authorized workspace reads"],
];

export default function VsixAuditComparisonPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Should I use GuardRails or vsix-audit to scan a VS Code extension?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Use vsix-audit when you want an independent local CLI scan of a downloaded VSIX package. Use GuardRails when you need published exact-release evidence, release monitoring, workspace policy and decision history, or a read-only AI-assisted review workflow. They can be used together.",
        },
      },
      {
        "@type": "Question",
        name: "Does a clean VSIX scan guarantee an extension is safe?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. A scan is evidence about the analyzed package and its coverage. Review findings, coverage limits, artifact identity, publisher context, and the change history of later releases before making a security decision.",
        },
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className={`${styles.inner} ${styles.mcpInner}`}>
        <section className={`${styles.hero} ${styles.mcpHero}`}>
          <div className={styles.mcpMark} aria-hidden="true"><ShieldCheck /></div>
          <span className={styles.eyebrow}>VS Code extension security</span>
          <h1>Use the scanner that matches the decision.</h1>
          <p><a href={VSIX_AUDIT_URL} target="_blank" rel="noreferrer">vsix-audit</a> and GuardRails both examine VS Code extension risk, but they solve different parts of the workflow. Start with the local package when you need independent CLI inspection. Use GuardRails when the decision needs an exact-release evidence record, ongoing monitoring, or team governance.</p>
          <div className={styles.mcpPrinciples} aria-label="Comparison principles">
            <span><FileSearch /> Local package inspection</span>
            <span><CheckCircle2 /> Exact-release evidence</span>
            <span><SquareStack /> Monitoring and governance</span>
          </div>
        </section>

        <section className={styles.mcpRecommendation}>
          <div className={styles.mcpSectionLead}>
            <span className={styles.eyebrow}><FileSearch /> Start with the boundary</span>
            <h2>Two useful tools. Different evidence paths.</h2>
            <p>The credible answer is not that one scanner replaces the other. Choose the first tool by where the extension is and what must happen after the initial review.</p>
          </div>
          <div className={styles.mcpBehaviorGrid}>
            <article><FileSearch /><strong>Use vsix-audit for a local VSIX</strong><p>When you have downloaded a specific <code>.vsix</code> and want an independent, local command-line scan before installation, start with vsix-audit.</p><a href={VSIX_AUDIT_URL} target="_blank" rel="noreferrer">Open vsix-audit <ArrowRight /></a></article>
            <article><ShieldCheck /><strong>Use GuardRails for release evidence</strong><p>When the question is about a published marketplace release, inspect the exact-release report, artifact identity, analysis coverage, findings, and decision boundary.</p><Link href="/registry">Open Extension Registry <ArrowRight /></Link></article>
            <article><SquareStack /><strong>Use GuardRails after the first scan</strong><p>When a team must watch later releases, retain a decision, apply policy, or review inventory and alerts, continue in the GuardRails workspace.</p><Link href="/workspace">Open Team Workspace <ArrowRight /></Link></article>
            <article><TriangleAlert /><strong>Keep the uncertainty</strong><p>A clean or allowed result is evidence, not proof. An unreviewed release has no completed GuardRails analysis; it is not an approval.</p><Link href="/research">Read analysis boundaries <ArrowRight /></Link></article>
          </div>
        </section>

        <section className={styles.section}>
          <h2><SquareStack /> Comparison</h2>
          <div className={styles.paramTable}>
            <table>
              <thead><tr><th>Question</th><th>vsix-audit</th><th>GuardRails</th></tr></thead>
              <tbody>{comparison.map(([question, audit, guardrails]) => <tr key={question}><td><strong>{question}</strong></td><td>{audit}</td><td>{guardrails}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2><ArrowRight /> A defensible pre-install workflow</h2>
          <div className={styles.mcpConnectGrid}>
            <article><h3>1. Pin the release</h3><p>Resolve the publisher, extension ID, and exact version you intend to install. Do not let a result for one release stand in for another.</p></article>
            <article><h3>2. Inspect the package</h3><p>For an independent local check, download the release and use vsix-audit. Review its findings and coverage rather than relying on a clean exit code alone.</p></article>
            <article><h3>3. Record and monitor</h3><p>Use GuardRails to keep the published-release evidence, review rationale, policy context, and later-release changes available to the people who own the decision.</p></article>
          </div>
        </section>

        <section className={styles.mcpBoundary}>
          <div><span className={styles.eyebrow}><TriangleAlert /> No universal verdict</span><h2>A scan lowers uncertainty. It does not erase it.</h2></div>
          <div><p>Static and dynamic analysis both have coverage limits. Treat a result as scoped evidence for an identified artifact, inspect what was and was not analyzed, and revisit the decision when a new release changes the package.</p><p>For AI-assisted evidence retrieval, use the <Link href="/docs/mcp">GuardRails MCP</Link>. For GuardRails&apos; product scope, see <Link href="/vscode-extension-security">VS Code extension security</Link>.</p></div>
        </section>
      </div>
    </main>
  );
}
