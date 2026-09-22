import type { Metadata } from "next";
import styles from "./demos.module.css";

// The layout template already appends "· GuardRails"; never repeat it here.
export const metadata: Metadata = {
  title: "Product demos",
  description: "Short, silent screen recordings of GuardRails.",
  alternates: { canonical: "/demos" },
};

const demos = [
  {
    title: "Built-up context. Straight answers.",
    description: "Watch a release move from monitoring to review, with its evidence and decision kept together.",
    src: "/demos/guardrails-product-overview.mp4",
  },
  {
    title: "Audit local extensions",
    description: "See the GuardRails CLI inventory and local-analysis workflow.",
    src: "/demos/guardrails-cli-demo.mp4",
  },
  {
    title: "Spot a permission change",
    description: "Compare a new version against the approved baseline.",
    src: "/demos/guardrails-permission-diff-demo.mp4",
  },
] as const;

export default function DemosPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>PRODUCT WALKTHROUGHS</p>
        <h1>See GuardRails work.</h1>
        <span>Short walkthroughs from the real product: access, evidence, and decisions.</span>
      </header>
      <section className={styles.grid}>
        {demos.map((demo) => (
          <article className={styles.card} key={demo.src}>
            <video autoPlay muted loop playsInline controls preload="metadata">
              <source src={demo.src} type="video/mp4" />
              Your browser does not support video playback.
            </video>
            <div className={styles.cardCopy}>
              <h2>{demo.title}</h2>
              <p>{demo.description}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
