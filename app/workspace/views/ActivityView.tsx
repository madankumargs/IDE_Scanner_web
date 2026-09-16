"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Bell, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import type { QueueDecision } from "@/lib/teamDecisionQueue";
import type { Alert, Member } from "@/app/workspace/types";
import {
  formatWorkspaceTime,
  humanize,
  memberLabel,
} from "@/app/workspace/format";
import PageTitle from "@/app/workspace/views/PageTitle";
import {
  EmptyReview,
  QueueSkeleton,
} from "@/app/workspace/views/Overview";
import styles from "@/app/workspace/teamWorkspace.module.css";

export default function ActivityView({
  alerts,
  decisions,
  members,
  teamId,
  getAuthHeaders,
  role,
}: {
  alerts: Alert[];
  decisions: QueueDecision[];
  members: Member[];
  teamId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  role: string;
}) {
  type AuditRow = {
    event_id: string;
    action: string;
    object_type: string;
    extension_id: string | null;
    version: string | null;
    actor_id: string | null;
    risk_level: string | null;
    rationale: string | null;
    resulting_state: Record<string, unknown> | null;
    occurred_at: string;
  };
  const [auditEvents, setAuditEvents] = useState<AuditRow[]>([]);
  const [auditState, setAuditState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [auditMessage, setAuditMessage] = useState("");
  const [eventType, setEventType] = useState("");
  const [extension, setExtension] = useState("");
  const [version, setVersion] = useState("");
  const [actor, setActor] = useState("");
  const [risk, setRisk] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const canExport = role !== "viewer";
  const auditQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (eventType) query.set("event_type", eventType);
    if (extension.trim()) query.set("extension", extension.trim());
    if (version.trim()) query.set("version", version.trim());
    if (actor) query.set("actor", actor);
    if (risk) query.set("risk", risk);
    if (decisionFilter) query.set("decision", decisionFilter);
    if (deliveryStatus) query.set("delivery_status", deliveryStatus);
    if (fromDate)
      query.set("from", new Date(`${fromDate}T00:00:00Z`).toISOString());
    if (toDate)
      query.set("to", new Date(`${toDate}T23:59:59.999Z`).toISOString());
    return query.toString();
  }, [
    actor,
    decisionFilter,
    deliveryStatus,
    eventType,
    extension,
    fromDate,
    risk,
    toDate,
    version,
  ]);
  const loadAudit = useCallback(async () => {
    setAuditState("loading");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(
        `/api/teams/${teamId}/audit${auditQuery ? `?${auditQuery}` : ""}`,
        {
          headers,
          cache: "no-store",
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Audit history is unavailable.");
      setAuditEvents(Array.isArray(body.events) ? body.events : []);
      setAuditMessage("");
      setAuditState("ready");
    } catch (cause) {
      setAuditMessage(
        cause instanceof Error
          ? cause.message
          : "Audit history is unavailable.",
      );
      setAuditState("error");
    }
  }, [auditQuery, getAuthHeaders, teamId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadAudit(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);
  async function downloadAudit(format: "json" | "csv") {
    setAuditMessage("");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const query = new URLSearchParams(auditQuery);
      query.set("format", format);
      query.set("download", "1");
      const response = await fetch(`/api/teams/${teamId}/audit?${query}`, {
        headers,
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Audit export failed.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `guardrails-audit-${teamId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (cause) {
      setAuditMessage(
        cause instanceof Error ? cause.message : "Audit export failed.",
      );
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="Audit-ready activity"
        title="Every release decision, owner, and delivery event."
        copy="Release events and decisions stay visible to everyone with workspace access."
      />
      <section
        className={styles.auditToolbar}
        aria-label="Audit filters and export"
      >
        <div>
          <label>
            Event type
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
            >
              <option value="">All activity</option>
              <option value="decision">Decisions</option>
              <option value="monitoring">Monitoring</option>
              <option value="notification">Notifications</option>
              <option value="digest">Weekly digests</option>
              <option value="badge">Badges</option>
            </select>
          </label>
          <label>
            Version
            <input
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="1.2.3"
            />
          </label>
          <label>
            Actor
            <select
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            >
              <option value="">Anyone</option>
              {members.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {memberLabel(members, member.user_id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Risk
            <select
              value={risk}
              onChange={(event) => setRisk(event.target.value)}
            >
              <option value="">Any risk</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"].map(
                (level) => (
                  <option value={level} key={level}>
                    {humanize(level)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Decision
            <select
              value={decisionFilter}
              onChange={(event) => setDecisionFilter(event.target.value)}
            >
              <option value="">Any decision</option>
              {["review", "allow", "block", "exception"].map((value) => (
                <option value={value} key={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Delivery
            <select
              value={deliveryStatus}
              onChange={(event) => setDeliveryStatus(event.target.value)}
            >
              <option value="">Any status</option>
              {["pending", "sent", "failed", "skipped"].map((value) => (
                <option value={value} key={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label>
            Extension
            <input
              value={extension}
              onChange={(event) => setExtension(event.target.value)}
              placeholder="publisher.extension"
            />
          </label>
        </div>
        <div>
          <button type="button" onClick={() => void loadAudit()}>
            <RefreshCw /> Refresh
          </button>
          {canExport ? (
            <>
              <button type="button" onClick={() => void downloadAudit("csv")}>
                Export CSV
              </button>
              <button type="button" onClick={() => void downloadAudit("json")}>
                Export JSON
              </button>
            </>
          ) : (
            <span>Viewer access · export unavailable</span>
          )}
        </div>
      </section>
      {auditMessage ? (
        <div className={styles.auditError} role="alert">
          <CircleAlert /> {auditMessage}
        </div>
      ) : null}
      <section className={styles.timeline}>
        {auditState === "loading" ? <QueueSkeleton /> : null}
        {auditEvents.map((event) => (
          <article key={`${event.object_type}:${event.event_id}`}>
            <span>
              {event.object_type === "decision" ? <ShieldCheck /> : event.object_type === "badge" ? <BadgeCheck /> : <Bell />}
            </span>
            <div>
              <strong>{humanize(event.action)}</strong>
              <p>
                {event.rationale || "Workspace security activity recorded."}
              </p>
              <small>
                {event.extension_id
                  ? `${event.extension_id}${event.version ? `@${event.version}` : ""}`
                  : `Receipt ${event.event_id}`}
              </small>
              {event.object_type === "badge" && event.resulting_state ? (
                <small>
                  {badgeActivity(event.resulting_state)}
                </small>
              ) : null}
            </div>
            <time dateTime={event.occurred_at}>
              {formatWorkspaceTime(event.occurred_at)}
            </time>
          </article>
        ))}
        {auditState === "ready" && !auditEvents.length ? <EmptyReview /> : null}
        {auditState === "error" && (alerts.length || decisions.length) ? (
          <p className={styles.auditFallback}>
            The live audit could not load. Existing workspace activity remains
            intact.
          </p>
        ) : null}
      </section>
    </>
  );
}

function badgeActivity(state: Record<string, unknown>) {
  const status = typeof state.status === "string" ? state.status : "";
  const risk = typeof state.risk_score === "number" ? ` · risk ${state.risk_score.toFixed(2)}` : "";
  const recommendation = state.refresh_recommended === true ? " · refresh recommended" : "";
  return `${status ? humanize(status) : "Badge state recorded"}${risk}${recommendation}`;
}
