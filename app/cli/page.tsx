import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cloud,
  Code2,
  HardDrive,
  LockKeyhole,
  PackageCheck,
  ScanSearch,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import CliInstallCommand from "@/app/CliInstallCommand";
import "./cli.css";

export const metadata: Metadata = {
  title: "GuardRails CLI",
  description:
    "Scan extensions already installed in your IDE without uploading or executing their code.",
  alternates: { canonical: "/cli" },
};

const comparison = [
  {
    icon: Cloud,
    label: "Website Deep Scan",
    title: "Check a package before it reaches an editor.",
    body: "Search the Marketplace or submit a package for a managed Deep Scan with a shareable report.",
    use: "Best for evaluating an extension before installation.",
    action: "Open website Deep Scan",
    href: "/scan",
  },
  {
    icon: HardDrive,
    label: "GuardRails CLI",
    title: "Check what is already installed.",
    body: "Find extensions in VS Code, Cursor, Windsurf, VSCodium, and Insiders, then inspect local snapshots on your machine.",
    use: "Best for auditing the editor you use today.",
    action: "Install GuardRails CLI",
    href: "#install",
  },
] as const;

export default function CliPage() {
  return (
    <main className="cliPage">
      <section className="cliHero">
        <div className="cliHeroCopy">
          <span className="cliEyebrow">
            <TerminalSquare /> GuardRails CLI
          </span>
          <h1>Audit every VS Code-based editor on your machine.</h1>
          <p>
            Find extensions across VS Code, Cursor, Windsurf, and VSCodium.
            Inspect an integrity-checked local snapshot without executing the
            extension or sending its source to GuardRails.
          </p>
          <CliInstallCommand />
          <div className="cliHeroNotes">
            <span>
              <Check /> Python 3.11+
            </span>
            <span>
              <Check /> One self-contained, integrity-checked package
            </span>
            <span>
              <Check /> Extension code is never executed
            </span>
          </div>
          <p className="cliPackageNote">
            <a href="https://pypi.org/project/guardlens/" target="_blank" rel="noreferrer"><code>guardlens</code></a> is the PyPI package name; it installs the <code>guardrails</code> command. Verify the project on PyPI before installing.
          </p>
        </div>
        <div
          className="cliTerminal"
          aria-label="GuardRails CLI terminal preview"
        >
          <header>
            <span>
              <i />
              <i />
              <i />
            </span>
            <code>local extension audit</code>
            <b>private</b>
          </header>
          <div className="cliTerminalBody">
            <p>
              <em>$</em> guardrails
            </p>
            <strong>
              Installed extensions <small>143 detected</small>
            </strong>
            <div className="cliIdeRows">
              <span>
                <i /> Cursor <b>40</b>
              </span>
              <span>
                <i /> VS Code <b>81</b>
              </span>
              <span>
                <i /> Windsurf <b>22</b>
              </span>
            </div>
            <p>
              <em>›</em> Select an extension to inspect
            </p>
            <div className="cliResult">
              <span>ANALYSIS COMPLETE</span>
              <strong>Decision: review</strong>
              <small>Open findings, coverage, and report export.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="cliTrustStrip" aria-label="CLI trust boundary">
        <article>
          <strong>Local inventory</strong>
          <span>One view across every supported editor</span>
        </article>
        <article>
          <strong>Exact snapshot</strong>
          <span>Results stay tied to the package you scanned</span>
        </article>
        <article>
          <strong>Zero execution</strong>
          <span>Extension code is inspected, never launched</span>
        </article>
        <article>
          <strong>Private by default</strong>
          <span>Package contents stay on your machine</span>
        </article>
      </section>

      <section className="cliDecision" aria-labelledby="which-scan">
        <header>
          <span className="cliEyebrow">
            <PackageCheck /> Choose the right boundary
          </span>
          <h2 id="which-scan">
            Two ways to inspect an extension. One evidence standard.
          </h2>
          <p>
            Choose the product based on where the extension is. The analysis
            boundary stays clear.
          </p>
        </header>
        <div className="cliCompareGrid">
          {comparison.map(
            ({ icon: Icon, label, title, body, use, action, href }) => (
              <article key={label}>
                <Icon />
                <span>{label}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <small>{use}</small>
                <Link href={href}>
                  {action} <ArrowRight />
                </Link>
              </article>
            ),
          )}
        </div>
        <p className="cliEquivalence">
          <ShieldCheck /> For the same artifact, a properly configured CLI Deep
          Scan uses the same analysis boundary as website Deep Scan.
        </p>
      </section>

      <section className="cliPrivacy">
        <div>
          <span className="cliEyebrow">
            <LockKeyhole /> Local by design
          </span>
          <h2>Your extension code stays on your machine.</h2>
          <p>
            GuardRails copies selected extensions into a temporary private
            snapshot, scans it locally, then removes the snapshot. It never
            launches extension code.
          </p>
        </div>
        <div className="cliPrivacyFacts">
          <article>
            <Code2 />
            <div>
              <strong>No code upload</strong>
              <p>
                Source files and package contents are not sent to GuardRails.
              </p>
            </div>
          </article>
          <article>
            <ShieldCheck />
            <div>
              <strong>Verified scanner runtime</strong>
              <p>
                The scanner is bundled with GuardRails and checked for
                unexpected changes before it runs.
              </p>
            </div>
          </article>
          <article>
            <Cloud />
            <div>
              <strong>Optional intelligence lookups</strong>
              <p>
                Deep mode can query Marketplace, dependency, and repository
                metadata using IDs, versions, dependencies, and URLs.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="cliStart" id="install">
        <div className="cliStartIntro">
          <span className="cliEyebrow">
            <ScanSearch /> First local scan
          </span>
          <h2>Install once. Start with the extensions you already trust.</h2>
          <p>
            The interactive command groups installed extensions by IDE, lets you
            search before scanning, and produces findings, risk scoring,
            coverage, and exportable reports.
          </p>
        </div>
        <ol className="cliSteps">
          <li>
            <span>01</span>
            <div>
              <strong>Install the CLI</strong>
              <code>pipx install guardlens</code>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Open the local scanner</strong>
              <code>guardrails</code>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Use Deep Scan when needed</strong>
              <code>{'pipx install "guardlens[analysis]"'}</code>
            </div>
          </li>
        </ol>
        <div className="cliStartActions">
          <CliInstallCommand />
          <Link href="/settings">
            Read analysis boundaries <ArrowRight />
          </Link>
        </div>
      </section>
    </main>
  );
}
