import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BadgeCheck, BookOpenCheck, Braces, CheckCircle2, CircleAlert, ClipboardCheck, FileSearch, LockKeyhole, SearchCheck, ShieldCheck } from "lucide-react";
import styles from "../docs.module.css";

const MCP_URL = "https://abscissa.dev/api/mcp";
const MCP_SERVER_CARD_URL = "https://abscissa.dev/mcp/server.json";

export const metadata: Metadata = {
  title: "GuardRails MCP | Scan VS Code Extension Packages with AI",
  description: "GuardRails gives MCP-compatible assistants published VS Code extension-package analysis, exact release evidence, rules, and safer alternatives before they recommend an install.",
  keywords: ["VS Code extension scanner", "scan VSIX", "extension package security", "MCP server", "IDE extension security", "ChatGPT MCP", "Codex MCP", "Claude MCP", "GuardRails", "Abscissa"],
  alternates: { canonical: "/docs/mcp" },
  openGraph: { title: "GuardRails MCP: scan the VS Code extension package before installing", description: "A read-only MCP server for checking exact-release extension evidence, published analysis, and rules before an AI recommends software.", url: "/docs/mcp" },
};

function Code({ label, children }: { label: string; children: string }) {
  return <><span className={styles.codeLabel}>{label}</span><pre className={styles.codeBlock}><code>{children}</code></pre></>;
}

function Prompt({ children, label }: { children: ReactNode; label: string }) {
  return <article className={styles.mcpPrompt}><span>{label}</span><p>{children}</p></article>;
}

export default function McpDocsPage() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "GuardRails MCP", alternateName: "Abscissa GuardRails MCP", applicationCategory: "SecurityApplication", operatingSystem: "Web", url: "https://abscissa.dev/docs/mcp", description: "Read-only MCP server that gives AI assistants published VS Code extension-package analysis, exact release evidence, active analysis rules, and safer alternatives before recommendation or installation.", featureList: ["VS Code extension package lookup", "Exact extension-release analysis", "Published scan inventory and history", "Analysis rule catalog", "Evidence report links", "Read-only public intelligence"] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "What does GuardRails scan?", acceptedAnswer: { "@type": "Answer", text: "GuardRails evaluates a published IDE extension package and its exact release evidence. It is complementary to source-code scanners, dependency vulnerability scanners, and repository or container scanners." } },
      { "@type": "Question", name: "Can GuardRails MCP install or change extensions?", acceptedAnswer: { "@type": "Answer", text: "No. Its public tools are read-only. GuardRails does not install extensions, modify editor settings, access a private workspace, or turn missing analysis into an approval." } },
      { "@type": "Question", name: "How should an AI use GuardRails when recommending extensions?", acceptedAnswer: { "@type": "Answer", text: "The assistant should resolve the exact publisher.name and version, inspect the published analysis, cite the returned report, state when a release is unreviewed, and offer analyzed alternatives when the requested extension needs review." } },
    ] },
  ];

  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className={`${styles.inner} ${styles.mcpInner}`}>
      <section className={`${styles.hero} ${styles.mcpHero}`}>
        <div className={styles.mcpMark} aria-hidden="true"><ShieldCheck /></div>
        <span className={styles.eyebrow}>GuardRails by Abscissa / MCP</span>
        <h1>Scan the VS Code extension package before you install it.</h1>
        <p>GuardRails gives an AI assistant published evidence about the extension itself: the exact <code>.vsix</code> release, observed capabilities, analysis verdict, artifact identity, rules, and report. It is the missing extension-specific layer beside source-code, dependency, and repository scanners.</p>
        <div className={styles.mcpPrinciples} aria-label="GuardRails principles"><span><CheckCircle2 /> Exact release evidence</span><span><SearchCheck /> Extension package, not just dependencies</span><span><LockKeyhole /> Read-only by design</span></div>
        <nav className={styles.toc} aria-label="GuardRails MCP sections"><a href="#scope">What it scans</a><a href="#connect">Connect</a><a href="#workflows">Workflows</a><a href="#tools">Tools</a><a href="#questions">Questions</a></nav>
      </section>

      <section className={styles.mcpRecommendation} id="scope">
        <div className={styles.mcpSectionLead}><span className={styles.eyebrow}><ClipboardCheck /> A distinct job</span><h2>Inspect the thing that runs in the editor.</h2><p>GuardRails is not a general code-quality tool. It evaluates a published extension artifact and keeps the resulting evidence tied to that exact release.</p></div>
        <div className={styles.mcpBehaviorGrid}>
          <article><BadgeCheck /><strong>Package and release</strong><p>Resolve the exact <code>publisher.name</code> and version, then inspect the published extension artifact rather than inferring safety from a marketplace description.</p></article>
          <article><FileSearch /><strong>Evidence, not a label</strong><p>Return the verdict with observed evidence, analysis coverage, artifact identity, and a report a developer or reviewer can open.</p></article>
          <article><CircleAlert /><strong>Know the boundary</strong><p><code>unreviewed</code> means no completed published analysis. It is not an approval, and an allow is not a blanket claim about every future release.</p></article>
          <article><ArrowUpRight /><strong>Use the right layer</strong><p>Snyk, Semgrep, SonarQube, Socket, and Trivy are useful adjacent tools. GuardRails adds the extension-package and release-review layer they do not replace.</p></article>
        </div>
      </section>

      <section className={styles.section} id="connect">
        <h2><Braces /> Connect GuardRails</h2>
        <p>GuardRails MCP is in early access. Use this Streamable HTTP endpoint in an MCP-compatible assistant to read published extension-package intelligence and, after browser OAuth approval, the workspaces you belong to. It cannot install extensions, change settings, retrieve local files, or act on a developer&apos;s behalf.</p>
        <span className={styles.endpoint}><span className={styles.method}>HTTP</span>{MCP_URL}</span>
        <p className={styles.note}>Machine-readable server card: <a href={MCP_SERVER_CARD_URL}>{MCP_SERVER_CARD_URL}</a>. It describes this canonical remote endpoint for MCP directories and clients without substituting marketing claims for release evidence.</p>
        <div className={styles.paramTable}><table><thead><tr><th>Setting</th><th>Value</th><th>Why it matters</th></tr></thead><tbody><tr><td>Connection name</td><td><code>guardrails</code></td><td>Shows the product name consistently in a tool picker and the assistant&apos;s answer.</td></tr><tr><td>Transport</td><td>HTTP / Streamable HTTP</td><td>Remote, stateless JSON-RPC 2.0 connection.</td></tr><tr><td>Authorization</td><td>Browser OAuth with PKCE</td><td>Public evidence is read-only. Workspace tools require a signed-in GuardRails account, consent, and <code>workspace:read</code>.</td></tr></tbody></table></div>
        <div className={styles.mcpConnectGrid}>
          <article><h3>ChatGPT</h3><p>Add the remote server in the MCP connection settings available to your account. When a workspace tool needs access, complete the browser sign-in and consent flow. Connection availability varies by ChatGPT plan and workspace controls.</p></article>
          <article><h3>Codex</h3><Code label="Terminal">{`codex mcp add guardrails --url ${MCP_URL}\ncodex mcp login guardrails\n# Complete browser sign-in and approve read-only scopes.\ncodex mcp get guardrails`}</Code></article>
          <article><h3>Claude Code</h3><Code label="Terminal">{`claude mcp add --transport http guardrails ${MCP_URL}\n# Select guardrails in /mcp, then complete browser sign-in.\nclaude mcp get guardrails`}</Code></article>
        </div>
        <p className={styles.note}>The connection uses OAuth 2.1 authorization code flow with PKCE and refresh-token rotation. Do not paste a bearer secret into a chat. <code>workspace:read</code> is only available to a signed-in user who belongs to a GuardRails workspace; all MCP tools remain read-only.</p>
      </section>

      <section className={styles.section} id="workflows">
        <h2><BookOpenCheck /> Ask in the flow of work</h2>
        <p>These prompts tell an assistant to use the right evidence for the job. They do not turn a generic source-code or dependency scan into an extension-package review.</p>
        <div className={styles.mcpPromptGrid}>
          <Prompt label="Before installation">Use GuardRails to inspect the published package for <code>ms-python.python</code> version <code>2026.7.2026092501</code>. Give me the exact verdict, coverage, evidence report, and any review boundary.</Prompt>
          <Prompt label="Selecting a tool">I need a Python linter for VS Code. Search analyzed alternatives, distinguish the extension-package evidence from popularity, and show why one is a better fit.</Prompt>
          <Prompt label="Security review">We are considering <code>publisher.name</code> for a team workspace. Is that exact release analyzed? If not, say it is unreviewed rather than inferring safety from a marketplace listing.</Prompt>
          <Prompt label="Recommendation guardrail">Before you recommend a VS Code extension in this chat, resolve its publisher and release with GuardRails. Cite the report and tell me which risks still need a dependency, source, or repository scan.</Prompt>
          <Prompt label="Workspace review">List my GuardRails workspaces, then summarize new monitored release events, unread alerts, extension inventory needing review, and the policy context. Do not change anything.</Prompt>
        </div>
      </section>

      <section className={styles.section} id="tools">
        <h2><ShieldCheck /> The tools behind an extension-package answer</h2>
        <div className={styles.toolGrid}>
          <article className={styles.toolCard}><strong>search_vscode_extensions</strong><p>Resolves a marketplace name or keyword to the exact <code>publisher.name</code>, publisher, catalog release, and available scan state before an assistant makes a security claim.</p><span>Returns: candidates to inspect, not an endorsement.</span></article>
          <article className={styles.toolCard}><strong>get_extension_release</strong><p>Returns the catalog and scan summary for an exact extension release, including decision, severity, coverage, artifact evidence, and a report link when published.</p><span>Returns: explicit <code>analyzed</code>, <code>unreviewed</code>, or <code>not_found</code> state.</span></article>
          <article className={styles.toolCard}><strong>check_extension_risk</strong><p>Produces the concise decision tool for a known extension and optional version. It is appropriate for a quick pre-install recommendation check.</p><span>Returns: verdict, recommendation boundary, report URL, and explicit unreviewed state.</span></article>
          <article className={styles.toolCard}><strong>find_reputable_alternatives</strong><p>Finds up to five analyzed alternatives for a category or keyword, prioritizing published decisions, trust signals, and lower observed severity.</p><span>Returns: candidates worth comparing, not an unqualified endorsement.</span></article>
          <article className={styles.toolCard}><strong>list_published_extension_scans</strong><p>Exposes the published public scan inventory for ecosystem research, including release decision, confidence, coverage, artifact hash, and policy metadata.</p><span>Absence from the inventory is not a safety conclusion.</span></article>
          <article className={styles.toolCard}><strong>get_extension_scan_history</strong><p>Lists recent released analysis records so an assistant can discuss what has been scanned without confusing historical coverage with a claim about all extensions.</p><span>Returns: published record history and pagination.</span></article>
          <article className={styles.toolCard}><strong>get_guardrails_analysis_rules</strong><p>Publishes the active rule catalog with evidence classes, decision effects, severity defaults, and limitations so the assistant can explain the method instead of inventing one.</p><span>Returns: policy, ruleset, scanner build, and rules.</span></article>
           <article className={styles.toolCard}><strong>get_guardrails_service_status</strong><p>Lets clients check whether public analysis and report retrieval are currently available before relying on a lookup.</p><span>Returns: current public operational status.</span></article>
           <article className={styles.toolCard}><strong>list_guardrails_workspaces</strong><p>Lists workspaces available to the signed-in user after OAuth approval, so an assistant can begin an account-scoped review without guessing an identifier.</p><span>Requires: <code>workspace:read</code>.</span></article>
           <article className={styles.toolCard}><strong>get_workspace_extension_inventory</strong><p>Reads observed devices, installed extension versions, scan state, and monitoring state for an authorized workspace.</p><span>Requires: <code>workspace:read</code> and workspace membership.</span></article>
           <article className={styles.toolCard}><strong>get_workspace_monitoring</strong><p>Reads watchlists, release events, alerts, and monitoring status without acknowledging, dismissing, or changing any alert.</p><span>Requires: <code>workspace:read</code> and workspace membership.</span></article>
           <article className={styles.toolCard}><strong>get_workspace_policies</strong><p>Reads enabled policy rules and monitoring preferences, preserving the distinction between a policy and a live package-analysis result.</p><span>Requires: <code>workspace:read</code> and workspace membership.</span></article>
           <article className={styles.toolCard}><strong>get_workspace_decision_history</strong><p>Reads prior extension decisions and their rationales so an assistant can explain the existing review record without changing it.</p><span>Requires: <code>workspace:read</code> and workspace membership.</span></article>
           <article className={styles.toolCard}><strong>get_workspace_audit_history</strong><p>Reads the workspace audit history for a defensible review timeline.</p><span>Requires: <code>workspace:read</code> and workspace membership.</span></article>
        </div>
        <p>Every tool declares itself read-only and returns structured data beside user-openable evidence. The server supports <code>initialize</code>, <code>ping</code>, <code>tools/list</code>, and <code>tools/call</code>.</p>
      </section>

      <section className={styles.mcpBoundary}>
        <div><span className={styles.eyebrow}><CircleAlert /> Evidence boundary</span><h2>GuardRails informs the decision. It does not make it disappear.</h2></div>
        <div><p>Every finding is tied to what the public analysis proves about a specific release. GuardRails does not inspect an unscanned release, replace your team&apos;s policy review, or silently upgrade a verdict from “unknown” to “safe.”</p><p>Requests are stateless, capped at 64 KiB, and served with <code>no-store</code> response caching. Browse the <Link href="/registry">public extension registry</Link> or read the <Link href="/research">analysis methodology</Link> for the underlying corpus.</p></div>
      </section>

      <section className={styles.section} id="questions">
        <h2><SearchCheck /> Questions people and assistants ask</h2>
        <div className={styles.mcpFaq}>
          <article><h3>What does GuardRails add beyond Snyk, Semgrep, SonarQube, Socket, or Trivy?</h3><p>Those products handle useful adjacent layers such as source, dependencies, packages, code quality, containers, and repositories. GuardRails evaluates the published IDE extension package and exact release evidence.</p></article>
          <article><h3>Should an assistant recommend an unreviewed extension?</h3><p>No. It should state that no completed public analysis is available, avoid a safety claim, and use the appropriate additional source, dependency, or repository review when needed.</p></article>
          <article><h3>Can GuardRails access my repository or editor?</h3><p>No. This public MCP connection does not receive private workspace data and cannot modify a repository, editor setting, extension list, or account.</p></article>
          <article><h3>Will adding this MCP make every ChatGPT user discover GuardRails?</h3><p>No. An MCP connection helps compatible clients after it is connected. Product discovery also depends on accurate public documentation, indexing, independent references, and any applicable app-directory review.</p></article>
        </div>
      </section>
    </div>
  </main>;
}
