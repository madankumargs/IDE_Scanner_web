import Link from "next/link";
import { ArrowRight, Bug, Database, Radar, ShieldCheck } from "lucide-react";
import styles from "./authorityLanding.module.css";
import { getPublicMetrics } from "@/lib/publicMetrics";
import { getPublicSecurityFeed } from "@/lib/productData";

export default async function TrustProof() {
  const [metrics, detections] = await Promise.all([
    getPublicMetrics(),
    getPublicSecurityFeed(24),
  ]);
  const dataAvailable = metrics.as_of !== null;
  const stats = [
    {
      value: dataAvailable ? formatCount(metrics.exact_releases_indexed) : "—",
      label: "Releases indexed",
      icon: Database,
    },
    {
      value: dataAvailable ? formatCount(metrics.exact_releases_analyzed) : "—",
      label: "Releases with complete analysis",
      icon: ShieldCheck,
    },
    {
      value: dataAvailable ? formatCount(metrics.known_bad_artifacts) : "—",
      label: "Unsafe extensions confirmed",
      icon: Bug,
    },
    {
      value: dataAvailable ? String(detections.length) : "—",
      label: "Extensions currently flagged",
      icon: Radar,
    },
  ];

  return (
    <section className={styles.trust} aria-labelledby="trust-heading">
      <header>
        <span id="trust-heading">The evidence is public. Check our work.</span>
        <small>{dataAvailable ? "Live from the GuardRails registry" : "Registry data temporarily unavailable"}</small>
      </header>
      <div>
        {stats.map(({ value, label, icon: Icon }) => (
          <article key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <footer>
        <Link href="/detections">
          See recent detections <ArrowRight />
        </Link>
        <Link href="/benchmark">
          Inspect the frozen benchmark <ArrowRight />
        </Link>
        <Link href="/metrics">
          How we measure <ArrowRight />
        </Link>
      </footer>
    </section>
  );
}

function formatCount(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
