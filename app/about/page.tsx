import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ExternalLink, Fingerprint, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "GuardRails is an independent security product for evaluating IDE extensions before installation and following their published releases afterward.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="shell trustInfoPage">
      <header>
        <span>About GuardRails</span>
        <h1>Extension intelligence built around exact evidence.</h1>
        <p>
          GuardRails is an independent security product for evaluating IDE
          extensions before installation and following their published releases
          afterward.
        </p>
      </header>
      <section className="trustInfoGrid">
        <article>
          <ScanSearch />
          <h2>What the product does</h2>
          <p>
            It retrieves an exact published artifact, performs static analysis,
            and records bounded Bubblewrap runtime observations when the
            artifact requires them. Findings, coverage, artifact identity,
            scanner build, ruleset, and runtime limitations stay attached to
            the same report. Unsupported or failed runtime coverage is visible;
            it is not converted into an allow.
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
    </main>
  );
}
