"use client";
/* eslint-disable @next/next/no-img-element -- public SVG badge URLs are already optimized cacheable assets. */

import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./trustCard.module.css";

type PublicBadge = { extension_id: string; display_name: string; version: string; status: string; trust_label: string | null; risk_score: number | null; malware_score: number | null; coverage_percent: number | null; scanned_at: string | null; badge_url: string; report_url: string };
type Wall = { team: { slug: string }; badges: PublicBadge[] };

export default function TrustCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const [wall, setWall] = useState<Wall | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void params.then(({ slug }) => fetch(`/api/team-badge-wall/${encodeURIComponent(slug)}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("missing"); setWall(await response.json()); }).catch(() => setError(true))); }, [params]);
  if (error) return <main className={styles.state}><CircleAlert /><h1>Trust card unavailable.</h1><p>This team has not published a public badge wall.</p><Link href="/registry">Browse public reports <ArrowRight /></Link></main>;
  if (!wall) return <main className={styles.state}><LoaderCircle className={styles.spin} /><p>Loading public trust card…</p></main>;
  return <main className={styles.page}><header><Link href="/" className={styles.brand}>GuardRails</Link><span>Public trust card · {wall.team.slug}</span></header><section className={styles.hero}><BadgeCheck /><p>Published release evidence</p><h1>Trust, pinned to releases.</h1><span>Exact-release badges chosen by this team. Each one stays pinned to its analyzed version.</span></section><section className={styles.grid} aria-label="Published badges">{wall.badges.map((badge) => <article key={`${badge.extension_id}@${badge.version}`}><div><BadgeCheck /><div><strong>{badge.display_name}</strong><small>{badge.extension_id} · @{badge.version}</small></div></div><img src={badge.badge_url} alt={`GuardRails ${badge.extension_id} ${badge.version} badge`} height="20" /><dl><div><dt>Risk</dt><dd>{score(badge.risk_score)}</dd></div><div><dt>Malware</dt><dd>{score(badge.malware_score)}</dd></div><div><dt>Coverage</dt><dd>{badge.coverage_percent === null ? "Unavailable" : `${badge.coverage_percent}%`}</dd></div></dl><p className={badge.status === "stale" ? styles.stale : ""}>{badge.status === "stale" ? "A newer release is available; this badge remains pinned to this exact version." : badge.trust_label || "Analysis completed"}</p><Link href={badge.report_url}>Open exact report <ArrowRight /></Link></article>)}</section>{!wall.badges.length ? <section className={styles.empty}><h2>No public badges yet.</h2><p>This team has not published a release badge.</p></section> : null}<footer><Link href="/registry">Explore GuardRails <ArrowRight /></Link></footer></main>;
}

function score(value: number | null) { return value === null ? "—" : `${value}/100`; }
