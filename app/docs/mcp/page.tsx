import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CheckCircle2, CircleAlert, Code2, ExternalLink, ShieldCheck } from "lucide-react";
import styles from "../docs.module.css";

const MCP_URL = "https://abscissa.dev/api/mcp";

export const metadata: Metadata = {
  title: "Connect GuardRails to ChatGPT, Codex, and Claude",
  description: "Connect GuardRails MCP to ChatGPT, Codex, or Claude to check a published IDE extension before recommending or installing it.",
  alternates: { canonical: "/docs/mcp" },
  openGraph: {
    title: "GuardRails MCP for AI assistants",
    description: "Give your AI assistant read-only, evidence-backed IDE extension intelligence before it recommends an extension.",
    url: "/docs/mcp",
  },
};

function Code({ label, children }: { label: string; children: string }) {
  return <><span className={styles.codeLabel}>{label}</span><pre className={styles.codeBlock}><code>{children}</code></pre></>;
}

export default function McpDocsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GuardRails MCP",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    url: "https://abscissa.dev/docs/mcp",
    description: "Read-only MCP server for checking evidence-backed IDE extension risk before recommendation or installation.",
    featureList: ["Exact extension risk checks", "Reputable alternative discovery", "Read-only public intelligence"],
  };

  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className={styles.inner}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}><Bot /> GuardRails MCP</span>
        <h1>Ask your AI before it recommends an extension.</h1>
        <p>GuardRails gives ChatGPT, Codex, Claude, and other MCP-compatible assistants read-only public intelligence about published IDE extensions. It checks an exact release when you provide a version, links the evidence report, and never treats missing analysis as approval.</p>
        <nav className={styles.toc} aria-label="MCP documentation sections">
          <a href="#connect">Connect</a><a href="#ask">Try it</a><a href="#tools">Tools</a><a href="#limits">Limits</a>
        </nav>
      </section>

      <section className={styles.section} id="connect">
        <h2><Code2 /> Connection settings</h2>
        <p>Use this stable Streamable HTTP endpoint in your AI application&apos;s remote MCP or connector settings. GuardRails is read-only: it does not install extensions, change settings, or access private workspace data.</p>
        <span className={styles.endpoint}><span className={styles.method}>HTTP</span>{MCP_URL}</span>
        <div className={styles.paramTable}><table><thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody><tr><td>Connection name</td><td><code>guardrails</code></td></tr><tr><td>Connection type</td><td>HTTP / Streamable HTTP</td></tr><tr><td>Access</td><td>Read-only public intelligence</td></tr></tbody></table></div>
        <Code label="Codex">{`codex mcp add guardrails --url ${MCP_URL}`}</Code>
        <Code label="Claude Code">{`claude mcp add --transport http guardrails ${MCP_URL}`}</Code>
        <p className={styles.note}>For a token-protected early-access deployment, use a bearer token instead of placing a secret in a prompt. The connection instructions are in the <Link href="/docs#mcp">developer API documentation</Link>.</p>
      </section>

      <section className={styles.section} id="ask">
        <h2><ShieldCheck /> Try it after connecting</h2>
        <p>Ask naturally. Your assistant chooses the relevant GuardRails tool and returns structured evidence with a report link.</p>
        <Code label="Example prompts">{`Check ms-python.python version 2026.7.2026092501 before I install it.

Is this VS Code extension safe to recommend? Check publisher.name first.

This extension needs review. Find reputable alternatives for a Python linter.`}</Code>
        <p><CheckCircle2 /> A result marked <code>unreviewed</code> means no completed public analysis exists. It is an unknown, never an approval.</p>
      </section>

      <section className={styles.section} id="tools">
        <h2><Bot /> Read-only research tools</h2>
        <div className={styles.toolGrid}>
          <article className={styles.toolCard}><strong>check_extension_risk</strong><p>Checks the public GuardRails verdict for a published extension. Pin <code>publisher.name</code> and an exact version for install or procurement decisions; omit the version only when the latest analyzed release is sufficient.</p></article>
          <article className={styles.toolCard}><strong>find_reputable_alternatives</strong><p>Finds up to five analyzed alternatives for a category or keyword. Results favor allowed releases, higher trust tiers, verified publishers, and lower severity.</p></article>
        </div>
        <p>Every tool is annotated as read-only. Results include structured data for the assistant and user-openable report URLs for verification.</p>
      </section>

      <section className={styles.section} id="limits">
        <h2><CircleAlert /> Evidence boundary</h2>
        <p>GuardRails reports what the published analysis proves about a specific release. It does not make an installation decision for you, inspect an unscanned release, or replace a team&apos;s policy review.</p>
        <p>Requests are stateless JSON-RPC 2.0 calls, capped at 64 KiB. The server supports <code>initialize</code>, <code>ping</code>, <code>tools/list</code>, and <code>tools/call</code>.</p>
        <p>Need more detail? Browse the <Link href="/registry">public extension registry</Link>, read the <Link href="/research">analysis methodology</Link>, or <Link href="/contact">contact GuardRails</Link> about early access.</p>
      </section>

      <section className={styles.section}>
        <h2><ExternalLink /> For AI application directories</h2>
        <p>GuardRails MCP is a stable public HTTPS endpoint designed for remote MCP connections. The service is being prepared for directory review; until a directory listing is published, use the connection URL above to add it directly.</p>
      </section>
    </div>
  </main>;
}
