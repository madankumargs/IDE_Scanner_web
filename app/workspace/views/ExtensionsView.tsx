"use client";

import Link from "next/link";
import { ArrowRight, Plus, Radar, RefreshCw } from "lucide-react";
import type {
  MonitoringHealth,
  WatchItem,
} from "@/app/workspace/types";
import {
  formatWorkspaceTime,
  humanize,
  initials,
  watchName,
} from "@/app/workspace/format";
import PageTitle from "@/app/workspace/views/PageTitle";
import styles from "@/app/workspace/teamWorkspace.module.css";

export default function ExtensionsView({
  watches,
  badges,
  health,
  onRefresh,
}: {
  watches: WatchItem[];
  badges: Array<{ extension_id: string; version?: string; status?: string }>;
  health: MonitoringHealth;
  onRefresh: () => Promise<void>;
}) {
  const current = watches.filter(
    (item) => item.baseline_version && item.monitoring_state === "monitoring",
  ).length;
  const attention = watches.filter(
    (item) =>
      !["monitoring", "baseline_pending"].includes(
        item.monitoring_state || "baseline_pending",
      ),
  ).length;
  return (
    <>
      <PageTitle
        eyebrow="Monitoring"
        title="Extensions under watch."
        copy="Every baseline stays tied to the exact release your team reviewed."
        action={
          <Link className={styles.primaryAction} href="/registry">
            <Plus /> Monitor extension
          </Link>
        }
      />
      <section className={styles.monitorHealthPanel}>
        <header>
          <div>
            <span className={`${styles.healthDot} ${styles[health.status]}`} />
            <div>
              <strong>
                {health.status === "healthy"
                  ? "Registry checks are healthy"
                  : health.status === "degraded"
                    ? "Monitoring needs attention"
                    : "Waiting for the first registry check"}
              </strong>
              <p>
                {health.status === "degraded"
                  ? health.error || "The most recent refresh failed."
                  : `GuardRails checks watched Marketplace and Open VSX releases every ${health.cadence_hours} hours.`}
              </p>
            </div>
          </div>
          <button onClick={() => void onRefresh()}>
            <RefreshCw /> Refresh status
          </button>
        </header>
        <div>
          <article>
            <span>Current baselines</span>
            <strong>{current}</strong>
            <small>Exact releases ready for comparison</small>
          </article>
          <article>
            <span>Need attention</span>
            <strong>{attention}</strong>
            <small>Comparison, failure, or incomplete state</small>
          </article>
          <article>
            <span>Last registry check</span>
            <strong>{formatWorkspaceTime(health.last_checked_at)}</strong>
            <small>Latest completed provider refresh</small>
          </article>
          <article>
            <span>Next expected check</span>
            <strong>{formatWorkspaceTime(health.next_check_at)}</strong>
            <small>Six-hour scheduled cadence</small>
          </article>
        </div>
      </section>
      <section className={styles.tableCard}>
        <header>
          <span>Extension</span>
          <span>Baseline</span>
          <span>Monitoring state</span>
            <span>Last event</span>
            <span>Badge</span>
        </header>
        {watches.map((item) => (
          <article key={item.extension_id}>
            <div>
              <span className={styles.extensionAvatar}>
                {initials(item.extension_id)}
              </span>
              <strong>{watchName(item)}</strong>
              <small>{item.extension_id}</small>
            </div>
            <code>@{item.baseline_version || "Pending"}</code>
            <span className={styles.statusGood}>
              <i />
              {humanize(item.monitoring_state || "baseline pending")}
            </span>
            <time>
              {formatWorkspaceTime(item.last_event_at || item.created_at)}
            </time>
            <span className={badges.find((badge) => badge.extension_id.toLowerCase() === item.extension_id.toLowerCase())?.status === "ready" ? styles.statusGood : styles.statusWarn}>
              <i /> {badgeLabel(badges.find((badge) => badge.extension_id.toLowerCase() === item.extension_id.toLowerCase())?.status)}
            </span>
          </article>
        ))}
        {!watches.length ? (
          <div className={styles.tableEmpty}>
            <Radar />
            <h2>Start your monitoring coverage.</h2>
            <p>
              Add an extension from a completed report. GuardRails will preserve
              its baseline and watch every new release.
            </p>
            <Link href="/registry">
              Find an extension <ArrowRight />
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}

function badgeLabel(status?: string) { return status === "ready" ? "Ready" : status === "stale" ? "Refresh" : status === "pending" ? "Scanning" : status === "failed" ? "Retry" : "Not covered"; }
