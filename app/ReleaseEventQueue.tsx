"use client";
import { ArrowRight, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";
type ReleaseEvent = { id: string; extension_id: string; baseline_version: string | null; target_version: string; state: string; error: string | null };
type ReleaseDetail = { comparison_available?: boolean; comparison_error?: string; from?: { version: string; decision?: string; severity?: string }; to?: { version: string; decision?: string; severity?: string }; changes?: { capabilities?: { added?: string[]; removed?: string[] }; findings?: { added?: unknown[]; removed?: unknown[] }; dependencies?: { added?: unknown[]; removed?: unknown[] }; files?: { added?: unknown[]; removed?: unknown[]; changed?: unknown[] } } };
export default function ReleaseEventQueue({ teamId }: { teamId: string }) {
  const db = useMemo(() => browserDb(), []);
  const [events, setEvents] = useState<ReleaseEvent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const headers = await browserAuthHeaders(db);
      if (!headers.Authorization) { setState("error"); return; }
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/release-events`, { headers, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setState("error");
      setEvents(Array.isArray(body.events) ? body.events : []);
      setState("ready");
    } catch { setState("error"); }
  }, [db, teamId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function openDetail(eventId: string) {
    setDetailState("loading"); setDetail(null);
    try {
      const headers = await browserAuthHeaders(db);
      if (!headers.Authorization) { setDetailState("error"); return; }
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/release-events/${encodeURIComponent(eventId)}`, { headers, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setDetailState("error"); return; }
      setDetail(body); setDetailState("idle");
    } catch { setDetailState("error"); }
  }
  return <section className="releaseQueue"><header><div><span>Release-change queue</span><h3>Changes waiting for a decision</h3><p>Every item compares a new release with the version your team reviewed.</p></div><button type="button" className="iconButton" aria-label="Refresh release queue" onClick={() => void load()}><RefreshCw/></button></header>{state === "loading" ? <p className="workspaceMessage"><LoaderCircle className="spin"/> Loading release changes…</p> : null}{state === "error" ? <p className="previewError">The release queue could not be loaded. <button className="textAction" onClick={() => void load()}>Try again</button></p> : null}{state === "ready" && !events.length ? <div className="releaseQueueEmpty"><CheckCircle2/><div><strong>No release changes need attention.</strong><p>When a monitored extension publishes a new version, its exact comparison will appear here.</p></div></div> : null}{events.map((event) => <article key={event.id}><span className={`releaseState ${event.state}`}>{event.state.replaceAll("_", " ")}</span><div><strong>{event.extension_id}</strong><code>{event.baseline_version || "baseline pending"} → {event.target_version}</code><p>{event.state === "analysis_failed" ? event.error || "Analysis failed before a comparison could be produced." : event.state === "analysis_incomplete" ? "Analysis is incomplete. This release is not approved." : event.state === "comparison_ready" ? "Exact comparison is ready for review." : "New artifact detected. Analysis has been queued."}</p></div><button className="iconButton" type="button" onClick={() => void openDetail(event.id)} aria-label={`Open ${event.extension_id} release evidence`}><ArrowRight/></button></article>)}{detailState === "loading" ? <p className="workspaceMessage"><LoaderCircle className="spin"/> Loading immutable comparison…</p> : null}{detailState === "error" ? <p className="previewError">The immutable comparison could not be loaded.</p> : null}{detail ? <div className="releaseComparison"><header><span>Exact release comparison</span><strong>{detail.from?.version} → {detail.to?.version}</strong><small>{detail.from?.decision || "unknown"} / {detail.from?.severity || "unknown"} → {detail.to?.decision || "unknown"} / {detail.to?.severity || "unknown"}</small></header>{detail.comparison_available && detail.changes ? <div><p><strong>Added:</strong> {(detail.changes.capabilities?.added || []).join(", ") || "No capabilities"} · {detail.changes.findings?.added?.length || 0} findings · {detail.changes.dependencies?.added?.length || 0} dependencies · {detail.changes.files?.added?.length || 0} files</p><p><strong>Removed:</strong> {(detail.changes.capabilities?.removed || []).join(", ") || "No capabilities"} · {detail.changes.findings?.removed?.length || 0} findings · {detail.changes.dependencies?.removed?.length || 0} dependencies · {detail.changes.files?.removed?.length || 0} files</p><p><strong>Modified files:</strong> {detail.changes.files?.changed?.length || 0}</p></div> : <p>{detail.comparison_error || "Comparison is not available until the target scan completes."}</p>}</div> : null}</section>;
}
