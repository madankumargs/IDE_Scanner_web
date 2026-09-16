import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FlaskConical,
  Quote,
} from "lucide-react";
import { researchArticles } from "@/lib/research";
import styles from "./research.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Research notes",
  description:
    "Field notes on IDE extension capability, per-version results, and the line between a useful signal and an unsupported conclusion.",
  alternates: { canonical: "/research" },
};

const principles = [
  "Exact artifact before reputation",
  "Evidence before interpretation",
  "Limitations beside every conclusion",
] as const;

export default function ResearchPage() {
  const [featured, ...articles] = researchArticles;

  return (
    <main className={styles.page}>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <FlaskConical /> GuardRails Research
          </span>
          <h1>
            Security research for
            <em> decisions you can defend.</em>
          </h1>
          <p>
            Practical field notes about IDE extension capability, exact-release
            evidence, and the line between a useful signal and an unsupported
            conclusion.
          </p>
        </div>
        <aside>
          <Quote />
          <p>
            A polished score never gets to outrun the artifact, coverage, or
            evidence behind it.
          </p>
          <span>GuardRails research standard</span>
        </aside>
      </section>

      <section className={styles.principles} aria-label="Research principles">
        {principles.map((principle, index) => (
          <span key={principle}>
            <i>{String(index + 1).padStart(2, "0")}</i>
            <CheckCircle2 />
            {principle}
          </span>
        ))}
      </section>

      <section className={styles.feature}>
        <Link href={`/research/${featured.slug}`}>
          <div className={styles.featureArt} aria-hidden="true">
            <span>CAPABILITY</span>
            <strong>≠</strong>
            <span>MALWARE</span>
          </div>
          <div className={styles.featureCopy}>
            <span>
              Featured field note · {featured.category} · {featured.reading}
            </span>
            <h2>{featured.title}</h2>
            <p>{featured.summary}</p>
            <strong>
              Read the field note <ArrowRight />
            </strong>
          </div>
        </Link>
        <aside>
          <FlaskConical />
          <small>Validation, not decoration</small>
          <h3>See which results we are willing to publish.</h3>
          <p>
            The frozen benchmark withholds a result when its exact Deep Scan
            cannot be reopened. No latest-version substitutions.
          </p>
          <Link href="/benchmark">
            Inspect the benchmark <ArrowRight />
          </Link>
        </aside>
      </section>

      <section className={styles.library}>
        <header>
          <div>
            <span>Research library</span>
            <h2>Short reads. Explicit boundaries.</h2>
          </div>
          <p>
            Written for developers and reviewers who need to understand what an
            extension can do, what changed, and what remains unknown.
          </p>
        </header>
        <div>
          {articles.map((article, index) => (
            <Link href={`/research/${article.slug}`} key={article.slug}>
              <span className={styles.articleNumber}>
                {String(index + 2).padStart(2, "0")}
              </span>
              <BookOpen />
              <div>
                <span>
                  {article.category} · {article.published} · {article.reading}
                </span>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
              </div>
              <ArrowRight />
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <div>
          <small>Start with the evidence</small>
          <h2>Inspect an exact extension release.</h2>
          <p>
            Open the registry to see artifact identity, analysis freshness,
            capability boundaries, and immutable report evidence together.
          </p>
        </div>
        <Link href="/registry">
          Open the Extension Registry <ArrowRight />
        </Link>
      </section>
    </main>
  );
}
