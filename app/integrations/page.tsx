import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Blocks,
  FileJson,
  MessagesSquare,
  MonitorSmartphone,
  Plug,
  TerminalSquare,
} from "lucide-react";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Where GuardRails fits into your workflow: editors, Slack and email notifications, Jira tickets, the local CLI, portable reports, and audit exports.",
  alternates: { canonical: "/integrations" },
};

const groups = [
  {
    icon: MonitorSmartphone,
    name: "Editors",
    tagline: "Coverage where extensions are published",
    items: [
      "Marketplace registries used by VS Code, Cursor, and Windsurf",
      "Exact-release reports for every monitored version",
      "No editor plugins required; review happens beside the marketplace",
    ],
  },
  {
    icon: BellRing,
    name: "Release notifications",
    tagline: "Meaningful changes only",
    items: [
      "Email alerts when a release gains new capability",
      "Slack delivery targets, encrypted at rest",
      "Quiet re-publishes stay silent; behavioral changes do not",
    ],
  },
  {
    icon: MessagesSquare,
    name: "Team review",
    tagline: "Review activity in familiar tools",
    items: [
      "Weekly digest of watched-extension changes",
      "Jira tickets from review decisions",
      "Shared inbox with assignment and rationale",
    ],
  },
  {
    icon: TerminalSquare,
    name: "Local workflow",
    tagline: "Analysis on your machine",
    items: [
      "GuardRails CLI inspects extensions installed locally",
      "Portable report bundles move evidence without uploading it",
      "Import into the browser Reports library when you choose",
    ],
  },
  {
    icon: FileJson,
    name: "Evidence export",
    tagline: "Records your compliance flow can consume",
    items: [
      "Role-aware CSV and JSON audit export",
      "Immutable scan dossiers with stable links",
      "Public metrics and inventory endpoints for your own tooling",
    ],
  },
  {
    icon: Blocks,
    name: "Bring your own automation",
    tagline: "Build on the same evidence",
    items: [
      "Published API endpoints for scans, inventory, and rules",
      "Report bundles as a stable interchange format",
      "Webhook-friendly release events for pipeline gates",
    ],
  },
] as const;

export default function IntegrationsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Plug /> Integrations
          </span>
          <h1>
            Delivered to
            <em> the tools you already use.</em>
          </h1>
          <p>
            Analysis results are delivered to your inbox, chat, issue tracker,
            and terminal, and remain portable as report files.
          </p>
        </div>
        <aside>
          <BellRing />
          <strong>Focused notifications.</strong>
          <p>
            Delivery targets are encrypted, can be tested from workspace
            settings, and are limited to meaningful release changes.
          </p>
        </aside>
      </section>
      <section className={styles.plans}>
        {groups.map(({ icon: Icon, name, tagline, items }) => (
          <article className={styles.plan} key={name}>
            <span>
              <Icon /> {name}
            </span>
            <div className={styles.price}>
              <strong>{tagline}</strong>
            </div>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className={styles.honesty}>
        <div>
          <span>Scope boundaries</span>
          <h2>Integrations remain narrowly scoped.</h2>
        </div>
        <ul>
          <li>
            GuardRails never requests access to your editor, repositories, or
            source code. The product analyzes published releases.
          </li>
          <li>
            Delivery targets receive notifications only. They do not grant
            GuardRails write access to those systems.
          </li>
          <li>
            Local CLI results remain on your machine until you explicitly
            export a portable report.
          </li>
        </ul>
      </section>
      <section className={styles.cta}>
        <div>
          <small>Connect a delivery path</small>
          <h2>Inspect an extension today.</h2>
          <p>
            Open a public per-version report, then connect notifications to
            the channel your team reads.
          </p>
        </div>
        <Link href="/registry">
          Search extensions <ArrowRight />
        </Link>
      </section>
    </main>
  );
}
