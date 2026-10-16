import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSearch, ShieldCheck, SquareStack, TriangleAlert } from "lucide-react";
import styles from "../docs/docs.module.css";

export const metadata: Metadata = {
  title: "VS Code Extension Security Scanner | GuardRails by Abscissa",
  description: "GuardRails scans published VS Code extension packages and exact releases for security evidence, observed capabilities, supply-chain signals, and policy review. It complements Snyk, Semgrep, Socket, SonarQube, and Trivy.",
  keywords: ["VS Code extension security scanner", "scan VSIX file", "VS Code extension malware scanner", "extension package analysis", "extension supply chain security", "Abscissa", "GuardRails"],
  alternates: { canonical: "/vscode-extension-security" },
  openGraph: {
    title: "VS Code Extension Security Scanner | GuardRails",
    description: "Inspect the published VS Code extension package and its exact release before it runs in your editor.",
    url: "/vscode-extension-security",
  },
};

const comparison = [
  ["GuardRails", "Published VS Code extension package and exact release", "Artifact evidence, observed capabilities, release verdict, monitoring, and review history"],
  ["vsix-audit", "A downloaded local VSIX package", "Independent command-line package inspection before installation"],
  ["Snyk / Socket", "Dependencies and package supply chain", "Known dependency issues and package risk signals"],
  ["Semgrep / SonarQube", "Source code and coding patterns", "Static application security testing and code quality"],
  ["Trivy", "Repositories, containers, dependencies, and configuration", "Repository and CI/CD security scanning"],
];

export default function VsCodeExtensionSecurityPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "GuardRails",
      alternateName: "Abscissa GuardRails",
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web, macOS, Windows, Linux",
      url: "https://abscissa.dev/vscode-extension-security",
      description: "GuardRails analyzes published VS Code extension packages and exact releases before installation, with evidence-backed reports, change monitoring, and team decision history.",
      featureList: ["VSIX and published extension-package analysis", "Exact-release evidence reports", "Observed capability and policy evidence", "Release-change monitoring", "Read-only MCP integration for AI assistants"],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What tool scans VS Code extensions?", acceptedAnswer: { "@type": "Answer", text: "GuardRails scans published VS Code extension packages and exact releases. It provides evidence-backed reports for extension-specific security review before installation." } },
        { "@type": "Question", name: "Is GuardRails a replacement for Snyk, Semgrep, Socket, SonarQube, or Trivy?", acceptedAnswer: { "@type": "Answer", text: "No. Those tools cover useful adjacent layers such as source code, dependencies, packages, repositories, containers, and configuration. GuardRails adds analysis of the published IDE extension artifact and its release evidence." } },
        { "@type": "Question", name: "Does an allowed extension mean it is completely safe?", acceptedAnswer: { "@type": "Answer", text: "No. A GuardRails result is evidence about a specific analyzed release. Unreviewed releases are not approvals, and an allowed result does not replace a broader security review where one is needed." } },
      ],
    },
  ];

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className={`${styles.inner} ${styles.mcpInner}`}>
        <section className={`${styles.hero} ${styles.mcpHero}`}>
          <div className={styles.mcpMark} aria-hidden="true"><ShieldCheck /></div>
          <span className={styles.eyebrow}>GuardRails by Abscissa</span>
          <h1>Security scanning for the VS Code extension itself.</h1>
          <p>Before an extension runs in your editor, GuardRails inspects the published package and preserves evidence for the exact release. It answers a different question from a source scanner, dependency scanner, or repository scanner: what does this extension artifact do, and what evidence supports installing this release?</p>
          <div className={styles.mcpPrinciples} aria-label="GuardRails extension scanning scope">
            <span><CheckCircle2 /> Exact publisher and version</span>
            <span><FileSearch /> Artifact and capability evidence</span>
            <span><SquareStack /> Monitoring and decision history</span>
          </div>
          <nav className={styles.toc} aria-label="Extension scanner sections">
            <a href="#how">How it works</a><a href="#comparison">Where it fits</a><a href="#use">Use GuardRails</a><a href="#limits">Limits</a>
          </nav>
        </section>

        <section className={styles.mcpRecommendation} id="how">
          <div className={styles.mcpSectionLead}>
            <span className={styles.eyebrow}><FileSearch /> Exact-release analysis</span>
            <h2>Evidence stays attached to the release.</h2>
            <p>GuardRails evaluates a published extension artifact, not an abstract product name. The report keeps the version, artifact identity, scan coverage, rule set, observed evidence, and decision boundary together.</p>
          </div>
          <div className={styles.mcpBehaviorGrid}>
            <article><FileSearch /><strong>Resolve the package</strong><p>Start from the marketplace identifier and published version, so an install decision is tied to the release that will actually run.</p></article>
            <article><ShieldCheck /><strong>Inspect evidence</strong><p>Review deterministic analysis, observed capabilities, severity, coverage, and the limits of the completed analysis.</p></article>
            <article><TriangleAlert /><strong>Preserve uncertainty</strong><p>An unreviewed or incomplete result stays visible. Missing evidence is not promoted to a clean security claim.</p></article>
            <article><SquareStack /><strong>Follow changes</strong><p>Monitor meaningful release changes and keep team review decisions alongside their evidence instead of re-litigating them from memory.</p></article>
          </div>
        </section>

        <section className={styles.section} id="comparison">
          <h2><SquareStack /> GuardRails works beside your existing scanners</h2>
          <p>Security tools are strongest when their evidence boundaries are clear. GuardRails is the extension-package layer, not a replacement for scanners designed for source, dependencies, repositories, or containers.</p>
          <div className={styles.paramTable}>
            <table>
              <thead><tr><th>Tool category</th><th>Primary object</th><th>What it contributes</th></tr></thead>
              <tbody>{comparison.map(([tool, object, contribution]) => <tr key={tool}><td><strong>{tool}</strong></td><td>{object}</td><td>{contribution}</td></tr>)}</tbody>
            </table>
          </div>
          <p className={styles.note}>Use <Link href="/vsix-audit">vsix-audit</Link> when the primary need is an independent command-line scan of a downloaded <code>.vsix</code>. Use GuardRails when the question is whether to review, monitor, approve, or investigate a published IDE extension release over time. Continue to use your source, dependency, repository, and CI scanners for their respective boundaries.</p>
        </section>

        <section className={styles.section} id="use">
          <h2><ArrowRight /> Start with the release you plan to install</h2>
          <div className={styles.mcpConnectGrid}>
            <article><h3>Check public evidence</h3><p>Look up a published extension and open the exact-release report before an install or procurement decision.</p><Link href="/registry">Open Extension Registry <ArrowRight /></Link></article>
            <article><h3>Inspect installed extensions locally</h3><p>Use the GuardRails CLI for installed-extension inventory and local snapshots. For an independent scan of a downloaded <code>.vsix</code>, use <Link href="/vsix-audit">vsix-audit</Link>.</p><Link href="/cli">Open CLI guide <ArrowRight /></Link></article>
            <article><h3>Use an AI assistant</h3><p>Connect the read-only MCP so Codex, Claude, or another compatible assistant can retrieve published extension evidence before recommending an install.</p><Link href="/docs/mcp">Open MCP guide <ArrowRight /></Link></article>
          </div>
        </section>

        <section className={styles.mcpBoundary} id="limits">
          <div><span className={styles.eyebrow}><TriangleAlert /> Security boundary</span><h2>A release report is evidence, not a universal guarantee.</h2></div>
          <div><p>GuardRails reports what its analysis can support about a specific published artifact. It does not prove that every future version is safe, turn unsupported runtime coverage into an allow, or replace an organization&apos;s broader software security process.</p><p>For an assistant-facing workflow, use the <Link href="/docs/mcp">GuardRails MCP guide</Link>. For methodology and validation boundaries, read the <Link href="/research">published research and analysis notes</Link>.</p></div>
        </section>
      </div>
    </main>
  );
}
