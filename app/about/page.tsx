import Link from "next/link";
import SarvamProgramNote from "@/app/SarvamProgramNote";
import type { Metadata } from "next";
import { ArrowRight, ExternalLink, Fingerprint, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "About GuardRails by Abscissa | VS Code extension security",
  description:
    "GuardRails by Abscissa is independent VS Code extension-package intelligence: exact-release evidence, local inspection, change monitoring, team review, and read-only MCP access for AI-assisted research.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About GuardRails",
    description: "GuardRails by Abscissa is an independent product for inspecting published VS Code extension packages, monitoring release changes, and preserving evidence-backed software decisions.",
  };
  return (
    <main className="shell trustInfoPage">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />
      <header>
        <span>About GuardRails by Abscissa</span>
        <h1>VS Code extension security built around exact evidence.</h1>
        <p>
          GuardRails is Abscissa&apos;s independent security product for evaluating
          published VS Code extension packages before installation and following
          their published releases afterward.
        </p>
      </header>
      <section className="trustInfoGrid">
        <article>
          <ScanSearch />
          <h2>What the product does</h2>
          <p>
            It retrieves an exact published artifact, combines deterministic
            static analysis with bounded Bubblewrap runtime observations when
            the artifact requires them, and keeps both evidence types on the
            same report. Findings, coverage, artifact identity, scanner build,
            ruleset, and runtime limitations stay attached to that release.
            Unsupported or failed runtime coverage is visible; it is not
            converted into an allow.
          </p>
        </article>
        <article>
          <ExternalLink />
          <h2>How the product fits into work</h2>
          <p>
            Start with a public release report, inspect local extensions with
            the CLI when needed, monitor meaningful updates, and keep team
            decisions beside the evidence. A read-only MCP connection also
            lets compatible AI assistants research a release before making a
            recommendation.
          </p>
        </article>
        <article>
          <Fingerprint />
          <h2>What can be verified</h2>
          <p>
            Analysis Reports expose the version and SHA-256 boundary. The
            validation study publishes its corpus, regression results,
            corrections, and claim limitations.
          </p>
        </article>
        <article>
          <ShieldCheck />
          <h2>What is not claimed</h2>
          <p>
            GuardRails does not claim that every allowed extension is safe, that
            a capability proves malware, or that the development benchmark
            measures ecosystem-wide accuracy.
          </p>
        </article>
      </section>
      <section className="trustInfoGrid">
        <article>
          <ExternalLink />
          <h2>Who builds GuardRails</h2>
          <p>
            GuardRails is built by <strong>Preetham AK</strong>. Security
            methodology, product decisions, and corrections are published
            openly. Follow along on{" "}
            <a
              href="https://linkedin.com/in/preetham-ak"
              target="_blank"
              rel="me noopener noreferrer"
            >
              LinkedIn
            </a>
            , or write to <a href="mailto:hello@abscissa.dev">hello@abscissa.dev</a>.
          </p>
        </article>
      </section>
      <section className="trustInfoGrid sarvamAbout">
        <article>
          <Sparkles />
          <h2>Supported through Sarvam AI&apos;s Startup Program</h2>
          <p>
            GuardRails has been accepted into the Sarvam AI Startup Program.
            We&apos;re working with Sarvam AI through its Startup Program to make scan results easier to read. The guide helps with three common questions: Should I install this? What should I do about a flagged release? How should I answer a publisher? The scan remains the source of truth, and the guide says when it does not have enough information.
          </p>
          <p>
            <a href="https://indus.sarvam.ai" target="_blank" rel="noreferrer">
              Open Sarvam Indus
            </a>{" "}
            ·{" "}
            <a href="https://docs.sarvam.ai" target="_blank" rel="noreferrer">
              Read the API docs
            </a>
          </p>
        </article>
      </section>
      <section className="trustInfoAction">
        <div>
          <span>Evaluate the evidence</span>
          <h2>Start with a public artifact.</h2>
          <p>
            No account is required to inspect the Extension Registry or
            validation evidence.
          </p>
        </div>
        <Link href="/registry">
          Open Extension Registry <ArrowRight />
        </Link>
      </section>
      <SarvamProgramNote />
    </main>
  );
}
