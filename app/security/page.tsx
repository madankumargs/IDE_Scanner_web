import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  FileCheck2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Security",
  description:
    "Managed Deep Scan combines exact-artifact static analysis with bounded Bubblewrap runtime evidence, and workspace delivery targets stay encrypted.",
  alternates: { canonical: "/security" },
};

const controls = [
  {
    icon: LockKeyhole,
    label: "Analysis",
    title: "Managed Deep Scan observes only inside isolation",
    text: "Deep Scan extracts and statically inspects an exact published artifact, then runs bounded Bubblewrap observations for capabilities that require runtime coverage. The worker never executes an extension on the host; a failed, timed-out, or unsupported runtime path remains incomplete or not applicable instead of becoming an allow.",
  },
  {
    icon: Fingerprint,
    label: "Evidence",
    title: "Every result keeps its identity",
    text: "Reports preserve extension ID, version, artifact SHA-256, scanner build, ruleset, coverage, and limitations so a newer result cannot silently replace the reviewed evidence.",
  },
  {
    icon: KeyRound,
    label: "Credentials",
    title: "Notification targets stay encrypted",
    text: "Workspace delivery targets are encrypted at rest and are excluded from audit exports. Test delivery responses return health metadata rather than stored credentials.",
  },
  {
    icon: Boxes,
    label: "Isolation",
    title: "Deep Scan uses disposable runners",
    text: "Published packages are prepared for analysis in an isolated runner. Results cross the boundary through a validated scan-result contract, not through extension-controlled output.",
  },
  {
    icon: RadioTower,
    label: "Delivery",
    title: "Failures remain observable",
    text: "Notification attempts record delivery state, bounded retries, and safe error details. A failed Slack or email delivery does not change the underlying extension decision.",
  },
  {
    icon: FileCheck2,
    label: "Claims",
    title: "Incomplete never means allowed",
    text: "Missing required analysis, unverifiable artifact identity, and unsupported outcomes remain visibly incomplete instead of being converted into a reassuring score.",
  },
] as const;

export default function SecurityPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <ShieldCheck /> GuardRails security
          </span>
          <h1>
            Security claims need
            <br />
            <em>visible boundaries.</em>
          </h1>
          <p>
            GuardRails analyzes privileged developer tooling. This page records
            the boundaries a reviewer needs to check: what runs, what is
            retained, and where an analysis result stops being a guarantee.
          </p>
          <div className={styles.actions}>
            <Link href="/settings">
              Read analysis boundaries <ArrowRight />
            </Link>
            <Link href="/benchmark">Inspect validation evidence</Link>
          </div>
        </div>
        <div className={styles.assurance}>
          <header>
            <BadgeCheck />
            <span>
              <small>Security posture</small>
              <strong>Evidence before assurance</strong>
            </span>
          </header>
          <div>
            <span>Package execution</span>
            <strong>Bubblewrap-isolated only</strong>
          </div>
          <div>
            <span>Artifact identity</span>
            <strong>Version + SHA-256</strong>
          </div>
          <div>
            <span>Incomplete analysis</span>
            <strong>Denied as approval</strong>
          </div>
          <footer>
            <ShieldCheck /> Public report limitations remain visible
          </footer>
        </div>
      </section>

      <section className={styles.sectionHead}>
        <span>Product controls</span>
        <h2>What GuardRails protects today.</h2>
        <p>
          These statements describe the current web scanner and workspace—not
          the future native GuardRails IDE sandbox.
        </p>
      </section>
      <section className={styles.controlGrid}>
        {controls.map(({ icon: Icon, label, title, text }) => (
          <article key={title}>
            <span>
              <Icon />
            </span>
            <small>{label}</small>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className={styles.disclosure} id="report">
        <span>
          <ShieldCheck />
        </span>
        <div>
          <small>Responsible disclosure</small>
          <h2>Found a security issue?</h2>
          <p>
            Do not include secrets, personal data, or unnecessary exploit
            material. Share the affected route or component, reproducible steps,
            expected impact, and a safe way to validate the issue through the
            support channel associated with your GuardRails workspace.
          </p>
        </div>
        <div className={styles.disclosureSteps}>
          <strong>Include</strong>
          <span>01 · Affected component</span>
          <span>02 · Reproduction steps</span>
          <span>03 · Security impact</span>
          <span>04 · Suggested validation</span>
        </div>
      </section>

      <section className={styles.linkRail}>
        <Link href="/privacy">
          <span>Data handling</span>
          <strong>See what GuardRails receives and retains.</strong>
          <ArrowRight />
        </Link>
        <Link href="/benchmark">
          <span>Validation</span>
          <strong>Inspect exact frozen benchmark evidence.</strong>
          <ArrowRight />
        </Link>
        <Link href="/metrics">
          <span>Detection catalog</span>
          <strong>Review rules and evidence classes.</strong>
          <ArrowRight />
        </Link>
      </section>
    </main>
  );
}
