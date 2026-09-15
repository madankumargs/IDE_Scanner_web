"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CircleAlert, CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import styles from "./billingPanel.module.css";

type BillingSummary = {
  plan: "free" | "team" | "business";
  planName: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  billingConfigured: boolean;
  canManageBilling: boolean;
  usage: Record<"monitored_extensions" | "team_members" | "notification_channels", number>;
  limits: Record<"monitored_extensions" | "team_members" | "notification_channels" | "audit_retention_days", number | null>;
  auditExport: boolean;
};

export default function BillingPanel({ teamId, getAuthHeaders }: { teamId: string; getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<"idle" | "checkout" | "portal">("idle");

  const load = useCallback(async () => {
    setState("loading"); setMessage("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/billing`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(String(body.error || "Plan and usage could not be loaded.")); setState("error"); return; }
      setSummary(body as BillingSummary); setState("ready");
    } catch { setMessage("Plan and usage could not be loaded."); setState("error"); }
  }, [getAuthHeaders, teamId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function openBilling(kind: "checkout" | "portal") {
    setAction(kind); setMessage("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/billing/${kind}`, { method: "POST", headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.url !== "string") { setMessage(String(body.error || "Billing could not be opened.")); setAction("idle"); return; }
      window.location.assign(body.url);
    } catch { setMessage("Billing could not be opened."); setAction("idle"); }
  }

  if (state === "loading") return <div className={styles.state}><LoaderCircle className={styles.spin}/><strong>Checking your plan</strong><p>Loading limits and current workspace usage…</p></div>;
  if (state === "error") return <div className={styles.state} role="alert"><CircleAlert/><strong>Plan details unavailable</strong><p>{message}</p><button onClick={() => void load()}><RefreshCw/> Try again</button></div>;
  if (!summary) return null;
  const resources = [
    ["Monitored extensions", "monitored_extensions"], ["Workspace members", "team_members"], ["Notification channels", "notification_channels"],
  ] as const;
  return <div className={styles.panel}>
    <header><div><span>Plan and usage</span><h2>{summary.planName}</h2><p>{statusCopy(summary)}</p></div><CreditCard/></header>
    <div className={styles.usage}>{resources.map(([label, key]) => { const limit=summary.limits[key]; const used=summary.usage[key]; const percent=limit ? Math.min(100, used/limit*100) : 0; return <article key={key}><div><strong>{label}</strong><span>{used} / {limit ?? "Unlimited"}</span></div><progress max="100" value={limit === null ? 0 : percent} aria-label={`${label}: ${used} of ${limit ?? "unlimited"}`}/></article>; })}</div>
    <div className={styles.entitlements}><span>{summary.limits.audit_retention_days} days of audit history</span><span>{summary.auditExport ? "CSV and JSON export included" : "Audit export requires Team"}</span></div>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <footer>{!summary.billingConfigured ? <p>Purchases are unavailable in this deployment. Your current limits remain enforced.</p> : !summary.canManageBilling ? <p>Only a workspace owner can change billing.</p> : summary.plan === "free" ? <button disabled={action !== "idle"} onClick={() => void openBilling("checkout")}>{action === "checkout" ? "Opening secure checkout…" : "Upgrade to Team"}<ArrowUpRight/></button> : <button disabled={action !== "idle"} onClick={() => void openBilling("portal")}>{action === "portal" ? "Opening billing portal…" : "Manage subscription"}<ArrowUpRight/></button>}</footer>
  </div>;
}

function statusCopy(summary: BillingSummary) {
  if (summary.status === "trialing") return `Trial access${summary.trialEndsAt ? ` through ${new Date(summary.trialEndsAt).toLocaleDateString()}` : ""}.`;
  if (summary.status === "past_due" || summary.status === "unpaid") return "Payment needs attention. Free-plan limits apply until billing recovers.";
  if (summary.cancelAtPeriodEnd) return `Cancellation scheduled${summary.currentPeriodEndsAt ? ` for ${new Date(summary.currentPeriodEndsAt).toLocaleDateString()}` : ""}.`;
  if (summary.status === "active") return "Your subscription is active and enforced at every workspace boundary.";
  return "Start small with limits that are enforced even when requests are sent directly to the API.";
}
