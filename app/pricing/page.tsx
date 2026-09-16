import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, Check, Minus, ReceiptText, ShieldCheck } from "lucide-react";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Scan is free forever. Monitoring is $19/month and Teams is $99/month for up to 25 seats — billing has not opened yet, and early access locks those prices in.",
  alternates: { canonical: "/pricing" },
};

type Cell = boolean | string;

// One price story, stated once: `price`/`suffix` is what you pay TODAY, `later`
// is the published price that early-access users lock in. Nothing on this page
// may imply a plan can be purchased while billing is off.
const plans = [
  {
    id: "scan",
    name: "Scan",
    audience: "For individual developers",
    price: "$0",
    suffix: "Free forever",
    tableSuffix: "Free forever",
    later: "",
    description:
      "Know what an extension does before you install it. Start with five Deep Scan trials without creating an account.",
    action: "Open the registry",
    href: "/registry",
    external: false,
    featured: false,
    badge: "",
    features: [
      "Per-version public reports",
      "Five no-account Deep Scan trials per 30 days",
      "Permission Passport and release diff",
      "Local analysis with the GuardRails CLI",
      "Personal watchlist for up to 3 extensions",
      "Guided human reviews during launch",
    ],
  },
  {
    id: "monitoring",
    name: "Monitoring",
    audience: "For teams sharing extensions",
    price: "$19",
    suffix: "per month",
    tableSuffix: "$19/month",
    later: "Not billed until billing opens — early access locks this price in",
    description:
      "Stop re-reviewing releases from scratch. Every update arrives analyzed, with only meaningful capability changes surfaced.",
    action: "Join early access",
    href: "/design-partners",
    external: false,
    featured: true,
    badge: "",
    features: [
      "Everything in Scan, unlimited watchlist",
      "Notifications on meaningful changes only",
      "Email and Slack delivery targets",
      "Weekly digest and scan history",
      "Shared review inbox, decisions with owners",
    ],
  },
  {
    id: "teams",
    name: "Teams",
    audience: "For governed organizations",
    price: "$99",
    suffix: "per month, up to 25 seats",
    tableSuffix: "$99/month",
    later: "Not billed until billing opens — early access locks this price in",
    description:
      "Roll extension policy out organization-wide, with decisions your auditor can read and a direct line to the founder.",
    action: "Talk to the founder",
    href: "/design-partners",
    external: false,
    featured: false,
    badge: "",
    features: [
      "Everything in Monitoring",
      "Allow, block, and exception rationale",
      "Decision memory across releases",
      "Role-aware CSV and JSON audit export",
      "API keys and bulk gate checks for CI",
      "SSO, policy direction, extended retention",
    ],
  },
] as const;

const comparison: Array<{
  group: string;
  rows: Array<[string, Cell, Cell, Cell]>;
}> = [
  {
    group: "Scanning and evidence",
    rows: [
      ["Per-version public reports", true, true, true],
      ["No-account Deep Scan trial", "5 / 30 days", "5 / 30 days", "5 / 30 days"],
      ["Permission Passport and capability diff", true, true, true],
      ["GuardRails CLI local inventory", true, true, true],
      ["Guided human review of a release", "Launch period", true, true],
    ],
  },
  {
    group: "Monitoring",
    rows: [
      ["Watchlist size", "3 extensions", "Unlimited", "Unlimited"],
      ["Automatic analysis of new releases", false, true, true],
      ["Notifications on meaningful changes only", false, true, true],
      ["Email and Slack delivery", false, true, true],
      ["Weekly digest and scan history", false, true, true],
    ],
  },
  {
    group: "Team workflow",
    rows: [
      ["Seats included", "1", "Up to 25", "Custom"],
      ["Shared review inbox and assignments", false, true, true],
      ["Allow, block, and exception rationale", false, false, true],
      ["Decision memory across releases", false, false, true],
      ["Role-aware CSV and JSON audit export", false, false, true],
      ["API keys and bulk gate checks (up to 200 releases/call)", false, true, true],
    ],
  },
  {
    group: "Organization",
    rows: [
      ["SSO and procurement support", false, false, true],
      ["Organization-wide policy direction", false, false, true],
      ["Extended audit retention", false, false, true],
      ["Private extension workflow planning", false, false, true],
      ["Direct line to the founder", false, false, true],
    ],
  },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true)
    return (
      <span className={styles.cellYes}>
        <Check /> Included
      </span>
    );
  if (value === false)
    return (
      <span className={styles.cellNo}>
        <Minus />
      </span>
    );
  return <span className={styles.cellText}>{value}</span>;
}

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <ReceiptText /> Pricing
          </span>
          <h1>
            Scan free, forever.<em> Lock in your plan price before billing opens.</em>
          </h1>
          <p>
            Public reports, the registry, and the GuardRails CLI are free
            permanently. Monitoring is $19/month and Teams is $99/month for up
            to 25 seats; billing has not opened yet, and early-access users
            keep those prices.
          </p>
        </div>
        <aside>
          <ShieldCheck />
          <strong>No payment is possible yet.</strong>
          <p>
            Billing is not enabled, so nothing on this page can be purchased
            today. When it opens, Monitoring is $19/month and Teams is $99/month
            for up to 25 seats. Anyone who joins early access before then keeps
            those prices, gets two months off on annual billing, and is covered
            by a 30-day money-back guarantee.
          </p>
        </aside>
      </section>

      <section className={styles.plans}>
        {plans.map((plan) => (
          <article
            className={`${styles.plan} ${plan.featured ? styles.featured : ""}`}
            key={plan.id}
          >
            <div className={styles.planHead}>
              <span>{plan.name}</span>
              {plan.badge ? (
                <em className={styles.planBadge}>{plan.badge}</em>
              ) : null}
            </div>
            <small className={styles.audience}>{plan.audience}</small>
            <div className={styles.price}>
              <strong>{plan.price}</strong>
              <small>{plan.suffix}</small>
            </div>
            {plan.later ? (
              <small className={styles.planLater}>Then {plan.later}</small>
            ) : null}
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.external ? (
              <a href={plan.href}>
                {plan.action}
                <ArrowRight />
              </a>
            ) : (
              <Link href={plan.href}>
                {plan.action}
                <ArrowRight />
              </Link>
            )}
          </article>
        ))}
      </section>

      <section className={styles.compareSection}>
        <header className={styles.sectionHead}>
          <span>Compare every detail</span>
          <h2>What you get on each plan.</h2>
        </header>
        <div className={styles.compareScroll}>
          <table className={styles.compare}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Feature</span>
                </th>
                {plans.map((plan) => (
                  <th scope="col" key={plan.id} data-plan={plan.id}>
                    <strong>{plan.name}</strong>
                    <small>{plan.tableSuffix}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((group) => (
                <Fragment key={group.group}>
                  <tr className={styles.groupRow}>
                    <td colSpan={4}>{group.group}</td>
                  </tr>
                  {group.rows.map(([label, scan, monitoring, teams]) => (
                    <tr key={`${group.group}-${label}`}>
                      <th scope="row">{label}</th>
                      <td><CellValue value={scan} /></td>
                      <td data-plan="monitoring"><CellValue value={monitoring} /></td>
                      <td><CellValue value={teams} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.compareNote}>
          Scan stays free. Monitoring and Teams prices apply when billing
          opens; early-access users keep them. Larger organizations are quoted
          on a call.
        </p>
      </section>

      <section className={styles.honesty}>
        <div>
          <span>Teams and organizations</span>
          <h2>Team plans are shaped with design partners.</h2>
        </div>
        <ul>
          <li>
            The team workspace provides a shared review inbox, decisions with
            owners, and audit export. Access is currently provided through the{" "}
            <Link href="/design-partners">design-partner program</Link>.
          </li>
          <li>
            Organizations above 25 seats, procurement, or custom retention needs
            are priced on a short call with the founder.
          </li>
        </ul>
      </section>

      <section className={styles.cta}>
        <div>
          <small>Choose your review path</small>
          <h2>Inspect an extension first.</h2>
          <p>
            Public reports require no account. Want to talk it through? Ask for a
            20-minute call and the founder will reply directly.
          </p>
        </div>
        <div className={styles.ctaActions}>
          <Link href="/registry">
            Search extensions <ArrowRight />
          </Link>
          <Link href="/design-partners">
            Request a call <ArrowRight />
          </Link>
        </div>
      </section>
    </main>
  );
}
