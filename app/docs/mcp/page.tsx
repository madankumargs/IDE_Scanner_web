import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BadgeCheck, BookOpenCheck, Braces, CheckCircle2, CircleAlert, ClipboardCheck, FileSearch, LockKeyhole, SearchCheck, ShieldCheck } from "lucide-react";
import styles from "../docs.module.css";

const MCP_URL = "https://abscissa.dev/api/mcp";

export const metadata: Metadata = {
  title: "GuardRails MCP | Evidence Before AI Recommends an Extension",
  description: "GuardRails gives ChatGPT, Codex, Claude, and other MCP-compatible assistants evidence-backed IDE extension intelligence before they recommend or install software.",
  keywords: ["MCP server", "IDE extension security", "AI extension recommendations", "VS Code extension risk", "ChatGPT MCP", "Codex MCP", "Claude MCP", "GuardRails"],
  alternates: { canonical: "/docs/mcp" },
  openGraph: { title: "GuardRails MCP: evidence before an AI recommends software", description: "A read-only MCP server for checking the analyzed risk, verdict, and evidence behind published IDE extensions.", url: "/docs/mcp" },
};

function Code({ label, children }: { label: string; children: string }) {
  return <><span className={styles.codeLabel}>{label}</span><pre className={styles.codeBlock}><code>{children}</code></pre></>;
}

function Prompt({ children, label }: { children: ReactNode; label: string }) {
  return <article className={styles.mcpPrompt}><span>{label}</span><p>{children}</p></article>;
}

export default function McpDocsPage() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "GuardRails MCP", applicationCategory: "DeveloperApplication", operatingSystem: "Web", url: "https://abscissa.dev/docs/mcp", description: "Read-only MCP server that gives AI assistants evidence-backed intelligence about published IDE extension releases before recommendation or installation.", featureList: ["Exact extension-release risk checks", "Reputable alternative discovery", "Evidence report links", "Read-only public intelligence"] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "What is GuardRails MCP?", acceptedAnswer: { "@type": "Answer", text: "GuardRails MCP is a read-only Model Context Protocol server that lets an AI assistant check public analysis of a published IDE extension before recommending it or helping install it." } },
      { "@type": "Question", name: "Can GuardRails MCP install or change extensions?", acceptedAnswer: { "@type": "Answer", text: "No. Its tools are read-only. GuardRails does not install extensions, modify editor settings, access a private workspace, or turn missing analysis into an approval." } },
      { "@type": "Question", name: "How should an AI use GuardRails when recommending extensions?", acceptedAnswer: { "@type": "Answer", text: "The assistant should check the exact publisher.name and version when known, cite the returned evidence report, state when a release is unreviewed, and offer analyzed alternatives when the requested extension needs review." } },
    ] },
  ];

  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className={`${styles.inner} ${styles.mcpInner}`}>
      <section className={`${styles.hero} ${styles.mcpHero}`}>
        <div className={styles.mcpMark} aria-hidden="true"><ShieldCheck /></div>
        <span className={styles.eyebrow}>GuardRails MCP / Extension intelligence</span>
        <h1>Make the recommendation earn its trust.</h1>
        <p>GuardRails gives an AI assistant a better answer to “which extension should I install?” Before it recommends software, the assistant can check the analyzed release, expose the evidence, name the uncertainty, and find a reputable alternative when the answer is not a clean yes.</p>
        <div className={styles.mcpPrinciples} aria-label="GuardRails principles"><span><CheckCircle2 /> Exact release evidence</span><span><SearchCheck /> Unknown is never approval</span><span><LockKeyhole /> Read-only by design</span></div>
        <nav className={styles.toc} aria-label="GuardRails MCP sections"><a href="#recommend">Recommendation behavior</a><a href="#connect">Connect</a><a href="#workflows">Workflows</a><a href="#tools">Tools</a><a href="#questions">Questions</a></nav>
      </section>

      <section className={styles.mcpRecommendation} id="recommend">
        <div className={styles.mcpSectionLead}><span className={styles.eyebrow}><ClipboardCheck /> A better default</span><h2>Helpful recommendations have receipts.</h2><p>GuardRails is not another chat layer. It is a compact evidence source an assistant can call at the moment a software recommendation becomes consequential.</p></div>
        <div className={styles.mcpBehaviorGrid}>
          <article><BadgeCheck /><strong>Check first</strong><p>For a named extension, check the exact <code>publisher.name</code> and version before calling it safe, trusted, or recommended.</p></article>
          <article><FileSearch /><strong>Show why</strong><p>Return the verdict with severity, confidence signals, and a report URL a developer or security reviewer can open.</p></article>
          <article><CircleAlert /><strong>Say what is unknown</strong><p>When analysis does not exist, say <code>unreviewed</code>. Do not convert absence of evidence into a positive recommendation.</p></article>
          <article><ArrowUpRight /><strong>Offer a path forward</strong><p>When a candidate needs review, find analyzed alternatives that better fit the requested category or use case.</p></article>
        </div>
      </section>

      <section className={styles.section} id="connect">
        <h2><Braces /> Connect GuardRails</h2>
        <p>Use this stable Streamable HTTP endpoint in an MCP-compatible assistant. GuardRails can only read public extension intelligence: it cannot install extensions, change settings, retrieve local files, or act on a developer&apos;s behalf.</p>
        <span className={styles.endpoint}><span className={styles.method}>HTTP</span>{MCP_URL}</span>
        <div className={styles.paramTable}><table><thead><tr><th>Setting</th><th>Value</th><th>Why it matters</th></tr></thead><tbody><tr><td>Connection name</td><td><code>guardrails</code></td><td>Recognizable in a tool picker and in assistant explanations.</td></tr><tr><td>Transport</td><td>HTTP / Streamable HTTP</td><td>Remote, stateless JSON-RPC 2.0 connection.</td></tr><tr><td>Permission</td><td>Read-only public intelligence</td><td>No install, write, workspace, or account access.</td></tr></tbody></table></div>
        <div className={styles.mcpConnectGrid}>
          <article><h3>ChatGPT</h3><p>Open Plugins, choose <strong>Add custom MCP server</strong>, enter the endpoint above, then install the connection in the chat where you are evaluating an extension.</p></article>
          <article><h3>Codex</h3><Code label="Terminal">{`codex mcp add guardrails --url ${MCP_URL}`}</Code></article>
          <article><h3>Claude Code</h3><Code label="Terminal">{`claude mcp add --transport http guardrails ${MCP_URL}`}</Code></article>
        </div>
        <p className={styles.note}>For a token-protected early-access deployment, configure a bearer token in the MCP client. Never paste a secret into a chat prompt. See the <Link href="/docs#mcp">developer API documentation</Link> for the authorization and operations contract.</p>
      </section>

      <section className={styles.section} id="workflows">
        <h2><BookOpenCheck /> Ask in the flow of work</h2>
        <p>These are the questions GuardRails is designed to strengthen. They make it clear to the assistant that a recommendation should be grounded in a scanned release, not merely a marketplace description.</p>
        <div className={styles.mcpPromptGrid}>
          <Prompt label="Before installation">Check <code>ms-python.python</code> version <code>2026.7.2026092501</code> before I install it. Tell me the verdict, severity, evidence report, and anything I should review.</Prompt>
          <Prompt label="Selecting a tool">I need a Python linter for VS Code. Find reputable analyzed alternatives and explain why you would recommend one over another.</Prompt>
          <Prompt label="Security review">We are considering <code>publisher.name</code> for a team workspace. Is the exact version analyzed? If not, say that plainly and do not recommend it.</Prompt>
          <Prompt label="Recommendation guardrail">Before you recommend any extension in this chat, check GuardRails when a publisher and version are available. Cite the report link in your answer.</Prompt>
        </div>
      </section>

      <section className={styles.section} id="tools">
        <h2><ShieldCheck /> The tools behind the answer</h2>
        <div className={styles.toolGrid}>
          <article className={styles.toolCard}><strong>check_extension_risk</strong><p>Checks the public GuardRails verdict for a published extension release. Use the exact <code>publisher.name</code> and version for an install, procurement, or policy decision; omit the version only when the latest analyzed release is enough.</p><span>Returns: verdict, evidence summary, report URL, and explicit unreviewed state.</span></article>
          <article className={styles.toolCard}><strong>find_reputable_alternatives</strong><p>Finds up to five analyzed alternatives for a category or keyword. Results prioritize allowed releases, higher trust tiers, verified publishers, and lower observed severity.</p><span>Returns: candidates worth comparing, not an unqualified endorsement.</span></article>
        </div>
        <p>Both tools declare themselves read-only and return structured data for the assistant alongside a user-openable evidence report. The server supports <code>initialize</code>, <code>ping</code>, <code>tools/list</code>, and <code>tools/call</code>.</p>
      </section>

      <section className={styles.mcpBoundary}>
        <div><span className={styles.eyebrow}><CircleAlert /> Evidence boundary</span><h2>GuardRails informs the decision. It does not make it disappear.</h2></div>
        <div><p>Every finding is tied to what the public analysis proves about a specific release. GuardRails does not inspect an unscanned release, replace your team&apos;s policy review, or silently upgrade a verdict from “unknown” to “safe.”</p><p>Requests are stateless, capped at 64 KiB, and served with <code>no-store</code> response caching. Browse the <Link href="/registry">public extension registry</Link> or read the <Link href="/research">analysis methodology</Link> for the underlying corpus.</p></div>
      </section>

      <section className={styles.section} id="questions">
        <h2><SearchCheck /> Questions people and assistants ask</h2>
        <div className={styles.mcpFaq}>
          <article><h3>What is GuardRails MCP?</h3><p>A read-only Model Context Protocol server that lets an AI assistant check public analysis of a published IDE extension before it recommends the extension or helps install it.</p></article>
          <article><h3>Should an assistant recommend an unreviewed extension?</h3><p>No. It should state that no completed public analysis is available, avoid a safety claim, and offer an analyzed alternative when that helps the user move forward.</p></article>
          <article><h3>Can GuardRails access my repository or editor?</h3><p>No. This public MCP connection does not receive private workspace data and cannot modify a repository, editor setting, extension list, or account.</p></article>
          <article><h3>Can I add GuardRails before it appears in an AI directory?</h3><p>Yes. Connect directly with the public endpoint above. GuardRails is packaged for directory review, but a directory listing is not required for an MCP-compatible client to use it.</p></article>
        </div>
      </section>
    </div>
  </main>;
}
