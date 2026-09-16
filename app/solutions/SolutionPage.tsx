import Link from "next/link";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import styles from "../marketing.module.css";

export type Solution = {
  eyebrow: string;
  title: string;
  emphasis: string;
  intro: string;
  icon: LucideIcon;
  promise: string;
  outcomes: Array<{ icon: LucideIcon; title: string; detail: string }>;
  steps: Array<{ title: string; detail: string }>;
  cta: string;
  href: string;
  callCta?: string;
};
export default function SolutionPage({ solution }: { solution: Solution }) {
  const Icon = solution.icon;
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Icon />
            {solution.eyebrow}
          </span>
          <h1>
            {solution.title}
            <em> {solution.emphasis}</em>
          </h1>
          <p>{solution.intro}</p>
        </div>
        <aside>
          <CheckCircle2 />
          <strong>{solution.promise}</strong>
          <p>
            Every conclusion remains attached to an exact extension release and
            the evidence available for that artifact.
          </p>
        </aside>
      </section>
      <section className={styles.steps}>
        <header className={styles.sectionHead}>
          <span>Working sequence</span>
          <h2>From extension identity to a recorded decision.</h2>
        </header>
        <div>
          {solution.steps.map((step, index) => (
            <article key={step.title}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <header className={styles.sectionHead}>
          <span>Evidence for this role</span>
          <h2>The release question stays visible.</h2>
        </header>
        <div className={styles.outcomes}>
          {solution.outcomes.map(({ icon: OutcomeIcon, title, detail }) => (
            <article key={title}>
              <OutcomeIcon />
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.cta}>
        <div>
          <small>Choose the next review surface</small>
          <h2>{solution.cta}</h2>
          <p>
            Open the product surface for this job. The exact release, its
            evidence, and the limits of the conclusion stay attached.
          </p>
        </div>
        {solution.callCta ? (
          <div className={styles.ctaActions}>
            <Link href={solution.href}>
              Open the workflow <ArrowRight />
            </Link>
            <a href="mailto:hello@abscissa.dev?subject=Intro%20call%20(20%20min)">
              {solution.callCta} <ArrowRight />
            </a>
          </div>
        ) : (
          <Link href={solution.href}>
            Open the workflow <ArrowRight />
          </Link>
        )}
      </section>
    </main>
  );
}
