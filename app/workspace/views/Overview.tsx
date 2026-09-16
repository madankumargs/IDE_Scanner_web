"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LayoutDashboard,
  Radar,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { QueueDecision } from "@/lib/teamDecisionQueue";
import type {
  Alert,
  MonitoringHealth,
  Team,
  View,
  WatchItem,
} from "@/app/workspace/types";
import { formatWorkspaceTime, greeting, initials } from "@/app/workspace/format";
import PageTitle from "@/app/workspace/views/PageTitle";
import styles from "@/app/workspace/teamWorkspace.module.css";

export function EmptyReview() {
  return (
    <div className={styles.empty}>
      <span>
        <CheckCircle2 />
      </span>
      <h3>Your team is caught up.</h3>
      <p>
        When a monitored release changes something meaningful, it will appear
        here with its evidence.
      </p>
      <Link href="/registry">
        Monitor an extension <ArrowRight />
      </Link>
    </div>
  );
}

export function QueueSkeleton() {
  return (
    <div className={styles.skeleton}>
      <span />
      <span />
      <span />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`${styles.metric} ${styles[tone]}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span>
        {label}
        <i />
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function ReviewRow({
  decision,
  priority,
}: {
  decision: QueueDecision;
  priority?: boolean;
}) {
  return (
    <article className={styles.reviewRow}>
      <span className={priority ? styles.riskHigh : styles.riskMedium}>
        {priority ? "High" : "Review"}
      </span>
      <div className={styles.extensionAvatar}>
        {initials(decision.extension_id)}
      </div>
      <div>
        <strong>{decision.extension_id}</strong>
        <small>
          Exact release <code>@{decision.version}</code>
        </small>
      </div>
      <p>
        {priority
          ? "New capabilities require a team decision"
          : "Release evidence is ready for review"}
      </p>
      <span className={styles.owner}>
        <UserRound /> {decision.assigned_to ? "Assigned" : "Unassigned"}
      </span>
      <ArrowRight />
    </article>
  );
}

export default function Overview({
  team,
  decisions,
  alerts,
  watches,
  badges,
  health,
  overdue,
  failed,
  loading,
  sampleMode,
  onSample,
  onNavigate,
}: {
  team: Team;
  decisions: QueueDecision[];
  alerts: Alert[];
  watches: WatchItem[];
  badges: Array<{ status?: string }>;
  health: MonitoringHealth;
  overdue: number;
  failed: number;
  loading: boolean;
  sampleMode: boolean;
  onSample: (value: boolean) => void;
  onNavigate: (view: View) => void;
}) {
  return (
    <>
      {sampleMode ? (
        <div className={styles.sampleBanner}>
          <Radar />
          <span>
            <strong>Sample workspace</strong>This preview uses example data and
            cannot change your real workspace.
          </span>
          <button onClick={() => onSample(false)}>Exit sample</button>
        </div>
      ) : null}
      <section className={styles.focusDeck}>
        <div className={styles.focusGlow} aria-hidden="true"><i /><i /><i /></div>
        <PageTitle
          eyebrow="Release pulse"
          title={decisions.length ? `${decisions.length} ${decisions.length === 1 ? "release needs" : "releases need"} a decision.` : "Nothing urgent. Keep shipping."}
          copy={`Good ${greeting()}, ${team.name}. Exact releases stay attached to every call.`}
          action={
            <div className={styles.overviewActions}>
              {!sampleMode && !decisions.length && !watches.length ? (
                <button
                  className={styles.sampleButton}
                  onClick={() => onSample(true)}
                >
                  <LayoutDashboard /> Preview sample workspace
                </button>
              ) : null}
              <button
                className={styles.refresh}
                onClick={() => window.location.reload()}
              >
                <RefreshCw /> Refresh
              </button>
            </div>
          }
        />
        <div className={styles.signalConstellation} aria-label="Workspace signal summary">
          <span><Radar /><b>{watches.length}</b><small>watched</small></span>
          <i />
          <span><ClipboardCheck /><b>{decisions.length}</b><small>to decide</small></span>
          <i />
          <span><ShieldCheck /><b>{failed ? "Check" : "Clear"}</b><small>delivery</small></span>
        </div>
      </section>
      <section className={styles.metrics} aria-label="Workspace measurements">
        <Metric
          label="Needs review"
          value={decisions.length}
          detail="Meaningful release changes"
          tone="amber"
          onClick={sampleMode ? undefined : () => onNavigate("inbox")}
        />
        <Metric
          label="Overdue"
          value={overdue}
          detail={overdue ? "Ownership needs attention" : "No late decisions"}
          tone={overdue ? "red" : "green"}
        />
        <Metric
          label="Monitoring"
          value={watches.length}
          detail="Extension baselines"
          tone="green"
          onClick={sampleMode ? undefined : () => onNavigate("extensions")}
        />
        <Metric
          label="Workspace health"
          value={
            failed ? `${failed} issue${failed === 1 ? "" : "s"}` : "Healthy"
          }
          detail={
            failed ? "Delivery needs attention" : "Monitoring is operational"
          }
          tone={failed ? "red" : "green"}
        />
        <Metric
          label="Badge coverage"
          value={watches.length ? `${Math.round((badges.filter((badge) => ["ready", "stale"].includes(badge.status || "")).length / watches.length) * 100)}%` : "—"}
          detail={`${badges.filter((badge) => badge.status === "stale").length} release changes to refresh`}
          tone={badges.some((badge) => badge.status === "stale" || badge.status === "failed") ? "amber" : "green"}
          onClick={sampleMode ? undefined : () => onNavigate("badges")}
        />
      </section>
      <div className={styles.overviewGrid}>
        <section className={styles.attention}>
          <header>
            <div>
              <span>Priority queue</span>
              <h2>Needs attention</h2>
            </div>
            <button onClick={() => onNavigate("inbox")}>
              View inbox <ArrowRight />
            </button>
          </header>
          {loading ? (
            <QueueSkeleton />
          ) : decisions.length ? (
            decisions
              .slice(0, 4)
              .map((decision, index) => (
                <ReviewRow
                  key={decision.id}
                  decision={decision}
                  priority={index === 0}
                />
              ))
          ) : (
            <EmptyReview />
          )}
        </section>
        <aside className={styles.health}>
          <span>Monitoring health</span>
          <div className={styles.healthRing}>
            <b>{watches.length ? Math.max(90, 100 - failed * 5) : 0}%</b>
            <small>current</small>
          </div>
          <ul>
            <li>
              <i className={styles.green} />
              <span>Active baselines</span>
              <strong>{watches.length}</strong>
            </li>
            <li>
              <i className={badges.some((badge) => badge.status === "stale") ? styles.amber : styles.green} />
              <span>Ready badges</span>
              <strong>{badges.filter((badge) => badge.status === "ready").length}</strong>
            </li>
            <li>
              <i className={styles.blue} />
              <span>New alerts</span>
              <strong>{alerts.length}</strong>
            </li>
            <li>
              <i className={failed ? styles.red : styles.green} />
              <span>Delivery failures</span>
              <strong>{failed}</strong>
            </li>
          </ul>
          <div className={styles.healthSchedule}>
            <span>
              <b>Last registry check</b>
              {formatWorkspaceTime(health.last_checked_at)}
            </span>
            <span>
              <b>Next expected check</b>
              {formatWorkspaceTime(health.next_check_at)}
            </span>
            {health.status === "degraded" ? (
              <em>{health.error || "Monitoring refresh needs attention."}</em>
            ) : null}
          </div>
          <button onClick={() => onNavigate("extensions")}>
            Open monitoring <ArrowRight />
          </button>
        </aside>
      </div>
      <section className={styles.activityCard}>
        <header>
          <div>
            <span>Live workspace</span>
            <h2>Recent activity</h2>
          </div>
          <button onClick={() => onNavigate("activity")}>See all</button>
        </header>
        <div>
          {alerts.slice(0, 3).map((alert) => (
            <article key={alert.id}>
              <span>
                <Radar />
              </span>
              <p>
                <strong>{alert.title}</strong>
                <small>
                  {alert.extension_id}@{alert.version} · Monitoring event
                </small>
              </p>
              <time>Recent</time>
            </article>
          ))}
          {!alerts.length ? (
            <article>
              <span>
                <CheckCircle2 />
              </span>
              <p>
                <strong>Your workspace is caught up.</strong>
                <small>New releases and team decisions will appear here.</small>
              </p>
              <time>Now</time>
            </article>
          ) : null}
        </div>
      </section>
    </>
  );
}
