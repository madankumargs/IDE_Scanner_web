"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  Radar,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import ExtensionSearch from "@/app/ExtensionSearch";
import { trackProductEvent } from "@/lib/analyticsEvents";
import type {
  MonitoringHealth,
  WatchItem,
} from "@/app/workspace/types";
import type { DiscoveryResult } from "@/lib/types";
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
  teamId,
  role,
  getAuthHeaders,
  initialExtension,
}: {
  watches: WatchItem[];
  badges: Array<{ extension_id: string; version?: string; status?: string }>;
  health: MonitoringHealth;
  onRefresh: () => Promise<void>;
  teamId: string;
  role: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  initialExtension?: string;
}) {
  const canManage = ["owner", "admin", "analyst"].includes(role);
  const [adding, setAdding] = useState(Boolean(initialExtension));
  const [selected, setSelected] = useState<DiscoveryResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (initialExtension) {
      trackProductEvent({
        name: "report_monitor_setup_opened",
        source_route: window.location.pathname,
      });
    }
  }, [initialExtension]);

  async function monitorSelected() {
    if (!selected) return;
    setSaving(true);
    setNotice("");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const productResponse = await fetch(
        `/api/extensions/${encodeURIComponent(selected.extension_id)}`,
      );
      const product = await productResponse.json().catch(() => ({}));
      if (!productResponse.ok) {
        throw new Error(
          String(product.error || "This extension could not be prepared for monitoring."),
        );
      }
      const scan =
        product.scan && typeof product.scan === "object"
          ? (product.scan as Record<string, unknown>)
          : null;
      const payload: Record<string, string> = {
        extension_id: selected.extension_id,
        version: selected.version,
      };
      if (scan?.id) payload.baseline_scan_id = String(scan.id);
      let response = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/watchlist`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok && payload.baseline_scan_id) {
        delete payload.baseline_scan_id;
        response = await fetch(
          `/api/teams/${encodeURIComponent(teamId)}/watchlist`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String(body.error || "Could not start monitoring this extension."),
        );
      }
      setNotice(
        `${selected.display_name} is now monitored from ${body.baseline_version || selected.version}.`,
      );
      if (initialExtension) {
        trackProductEvent({
          name: "report_monitor_completed",
          source_route: window.location.pathname,
        });
      }
      setSelected(null);
      setAdding(false);
      await onRefresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not start monitoring this extension.");
    } finally {
      setSaving(false);
    }
  }

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
          canManage ? (
            <button
              className={styles.primaryAction}
              onClick={() => setAdding(true)}
            >
              <Plus /> Monitor extension
            </button>
          ) : undefined
        }
      />
      {adding && canManage ? (
        <section
          className={styles.monitorAdd}
          aria-labelledby="monitor-extension-title"
        >
          <header>
            <div>
              <span>New baseline</span>
              <h2 id="monitor-extension-title">
                Choose an exact extension release.
              </h2>
              <p>
                GuardRails records the selected release as the baseline and brings
                the team back only when a later release changes.
              </p>
            </div>
            <button
              onClick={() => {
                setAdding(false);
                setSelected(null);
                setNotice("");
              }}
            >
              Cancel
            </button>
          </header>
          <ExtensionSearch
            initialQuery={initialExtension || ""}
            onSelect={setSelected}
            submitLabel="Find extension"
          />
          {selected ? (
            <div className={styles.monitorSelection}>
              <div>
                <strong>{selected.display_name}</strong>
                <code>{selected.extension_id}@{selected.version}</code>
              </div>
              <button disabled={saving} onClick={() => void monitorSelected()}>
                {saving ? <LoaderCircle className={styles.spin} /> : <CheckCircle2 />}
                {saving ? "Saving baseline…" : "Start monitoring"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {notice ? (
        <p
          className={
            notice.includes("now monitored")
              ? styles.monitorSuccess
              : styles.monitorError
          }
          role="status"
        >
          <CircleAlert /> {notice}
        </p>
      ) : null}
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
