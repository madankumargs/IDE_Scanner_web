"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Copy,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackProductEvent } from "@/lib/analyticsEvents";
import {
  type TeamBadge,
  type TeamBadgeStatus,
} from "@/lib/teamBadges";
import styles from "../badgeStudio.module.css";

type WatchItem = {
  extension_id: string;
  baseline_version?: string | null;
  last_observed_version?: string | null;
  monitoring_state?: string;
  source?: "watchlist" | "inventory";
  extensions?:
    | { display_name?: string }
    | Array<{ display_name?: string }>
    | null;
};

type InventoryItem = {
  extension_id: string;
  version: string;
  display_name?: string;
};

type Badge = TeamBadge & {
  badge_url: string;
  report_url: string;
};

type BadgeSummary = {
  total: number;
  ready: number;
  stale: number;
  pending: number;
  failed: number;
};

type Props = {
  teamId: string;
  role: string;
  watches: WatchItem[];
  getAuthHeaders: () => Promise<Record<string, string>>;
  initialExtension?: string;
  onChanged?: () => Promise<void>;
};

const writerRoles = ["owner", "admin", "analyst"];

export default function BadgeStudioView({
  teamId,
  role,
  watches,
  getAuthHeaders,
  initialExtension,
  onChanged,
}: Props) {
  const canCreate = writerRoles.includes(role);
  const canManage = role === "owner" || role === "admin";
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const candidates = useMemo(() => {
    const watched = new Set(watches.map((watch) => watch.extension_id.toLowerCase()));
    const inventoryCandidates = inventoryItems
      .filter((item) => !watched.has(item.extension_id.toLowerCase()))
      .map((item) => ({
        extension_id: item.extension_id,
        last_observed_version: item.version,
        source: "inventory" as const,
        extensions: { display_name: item.display_name },
      }));
    const combined = [...watches, ...inventoryCandidates];
    const first = initialExtension
      ? combined.find((watch) => watch.extension_id.toLowerCase() === initialExtension.toLowerCase())
      : null;
    return first
      ? [first, ...combined.filter((watch) => watch !== first)]
      : combined;
  }, [initialExtension, inventoryItems, watches]);
  const [selectedExtension, setSelectedExtension] = useState(
    candidates[0]?.extension_id || "",
  );
  const [version, setVersion] = useState(() => versionFor(candidates[0]));
  const [badges, setBadges] = useState<Badge[]>([]);
  const [summary, setSummary] = useState<BadgeSummary>({
    total: 0,
    ready: 0,
    stale: 0,
    pending: 0,
    failed: 0,
  });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [mutatingId, setMutatingId] = useState("");
  const studioTracked = useRef(false);

  const activeExtension = selectedExtension || candidates[0]?.extension_id || "";
  const selectedWatch = candidates.find(
    (watch) => watch.extension_id === activeExtension,
  );
  const activeVersion = version || (selectedExtension ? "" : versionFor(selectedWatch));
  const pendingBadge = badges.find(
    (badge) => badge.status === "pending" && badge.scan_job_id,
  );

  const loadBadges = useCallback(async () => {
    setState("loading");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const [response, inventoryResponse] = await Promise.all([
        fetch(`/api/teams/${encodeURIComponent(teamId)}/badges`, {
          headers,
          cache: "no-store",
        }),
        fetch(`/api/teams/${encodeURIComponent(teamId)}/inventory`, {
          headers,
          cache: "no-store",
        }),
      ]);
      const body = (await response.json().catch(() => ({}))) as {
        badges?: Badge[];
        summary?: BadgeSummary;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Badge health is unavailable.");
      const inventoryBody = (await inventoryResponse.json().catch(() => ({}))) as {
        items?: InventoryItem[];
      };
      setBadges(Array.isArray(body.badges) ? body.badges : []);
      setInventoryItems(Array.isArray(inventoryBody.items) ? inventoryBody.items : []);
      setSummary(body.summary || { total: 0, ready: 0, stale: 0, pending: 0, failed: 0 });
      if (!studioTracked.current) {
        trackProductEvent({
          name: "team_badge_studio_opened",
          source_route: "/workspace",
          badge_count: Array.isArray(body.badges) ? body.badges.length : 0,
        });
        studioTracked.current = true;
      }
      setState("ready");
      setMessage("");
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "Badge health is unavailable.");
    }
  }, [getAuthHeaders, teamId]);

  const syncBadge = useCallback(async (extensionId: string, exactVersion: string, force: boolean) => {
    if (!canCreate || saving) return;
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setMessage("Your session expired. Sign in again before creating a badge.");
      return;
    }
    const normalizedVersion = exactVersion.trim().replace(/^v/, "");
    if (!extensionId || !normalizedVersion) {
      setMessage("Choose an exact watched release first.");
      return;
    }
    setSaving(true);
    setMessage("");
    setCopyMessage("");
    trackProductEvent({ name: "team_badge_scan_requested", source_route: "/workspace", mode: "exact_release" });
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/badges`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ extension_id: extensionId, version: normalizedVersion, force }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        badge?: Badge;
        reused_scan?: boolean;
        error?: string;
      };
      if (!response.ok || !body.badge) throw new Error(body.error || "The badge could not be created.");
      setBadges((current) => [body.badge!, ...current.filter((badge) => badge.id !== body.badge!.id)]);
      setMessage(body.badge.status === "ready"
        ? body.reused_scan
          ? "Existing exact analysis reused. Your badge is ready."
          : "Scan complete. Your exact-release badge is ready."
        : "Scan queued. You can leave this page; Badge Studio will resume when the report is ready.");
      if (body.badge.status === "ready") {
        trackProductEvent({ name: "team_badge_created", source_route: "/workspace", mode: "exact_release" });
      }
      await onChanged?.();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The badge could not be created.");
    } finally {
      setSaving(false);
      await loadBadges();
    }
  }, [canCreate, getAuthHeaders, loadBadges, onChanged, saving, teamId]);

  const mutateBadge = useCallback(async (
    badge: Badge,
    action: "publish" | "unpublish" | "revoke",
  ) => {
    if (!canManage || mutatingId) return;
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setMessage("Your session expired. Sign in again before changing publication.");
      return;
    }
    setMutatingId(badge.id);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/badges/${encodeURIComponent(badge.id)}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(action === "revoke"
          ? { revoke: true }
          : { visibility: action === "publish" ? "public" : "private" }),
      });
      const body = (await response.json().catch(() => ({}))) as { badge?: Badge; error?: string };
      if (!response.ok || !body.badge) throw new Error(body.error || "The badge publication could not be changed.");
      setMessage(action === "publish"
        ? "Badge published. It is ready to embed anywhere."
        : action === "unpublish"
          ? "Badge unpublished. Existing embeds will stop resolving after the short cache window."
          : "Badge revoked. Its public token is permanently disabled.");
      await onChanged?.();
      await loadBadges();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The badge publication could not be changed.");
    } finally {
      setMutatingId("");
    }
  }, [canManage, getAuthHeaders, loadBadges, mutatingId, onChanged, teamId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBadges(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBadges]);

  useEffect(() => {
    const scanJobId = pendingBadge?.scan_job_id;
    if (!scanJobId) return;
    let active = true;
    let requestInFlight = false;
    const poll = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/deep-scans/${encodeURIComponent(scanJobId)}`, {
          headers,
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as {
          status?: string;
          scan_id?: string;
          error?: string;
        };
        if (!active) return;
        if (body.status === "failed") {
          setMessage(body.error || "The badge scan failed before a report was produced.");
          await loadBadges();
        } else if (body.status === "complete" || body.status === "incomplete") {
          // The list endpoint reconciles the team-owned projection from the
          // immutable report. Do not enqueue another scan while the callback's
          // report is still becoming visible to the read path.
          await loadBadges();
        }
      } catch {
        if (active) setMessage("Scan progress is temporarily offline. We’ll keep checking.");
      } finally {
        requestInFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [getAuthHeaders, loadBadges, pendingBadge]);

  async function copySnippet(badge: Badge, kind: "markdown" | "html") {
    const badgeUrl = absoluteUrl(badge.badge_url);
    const reportUrl = absoluteUrl(badge.report_url);
    const snippet = kind === "markdown"
      ? `[![GuardRails analysis](${badgeUrl})](${reportUrl})`
      : `<a href="${reportUrl}"><img src="${badgeUrl}" alt="Analyzed by GuardRails" width="240" height="20"></a>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyMessage(`${kind === "markdown" ? "Markdown" : "HTML"} copied.`);
      trackProductEvent({ name: "team_badge_copied", source_route: "/workspace", format: kind });
    } catch {
      setCopyMessage("Copy was blocked by the browser. Select the snippet manually.");
    }
  }

  return (
    <>
      <header className={styles.pageTitle}>
        <div>
          <span>Team Badge Studio</span>
          <h1>Make your team’s trust visible.</h1>
          <p>Publish an exact-release badge from the workspace your team already uses. Every score stays attached to the analyzed version and report.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => void loadBadges()} disabled={state === "loading"}>
          <RefreshCw className={state === "loading" ? styles.spin : ""} /> Refresh health
        </button>
      </header>

      <section className={styles.healthPanel} aria-label="Badge health">
        <div className={styles.healthIntro}>
          <span className={styles.eyebrow}><BadgeCheck /> Badge health</span>
          <h2>{summary.total ? `${summary.ready} trusted release${summary.ready === 1 ? "" : "s"} ready to share.` : "Start with one release your team already watches."}</h2>
          <p>{summary.stale ? `${summary.stale} badge${summary.stale === 1 ? " is" : "s are"} out of date because monitoring observed a newer release.` : "Badges never silently change. A new release earns its own exact identity."}</p>
        </div>
        <div className={styles.healthStats}>
          <span><b>{summary.ready}</b><small>Ready</small></span>
          <span><b>{summary.stale}</b><small>Release changed</small></span>
          <span><b>{summary.pending}</b><small>Scanning</small></span>
          <span><b>{summary.total ? Math.round((summary.ready / summary.total) * 100) : 0}%</b><small>Coverage</small></span>
        </div>
      </section>

      {!candidates.length ? (
        <section className={styles.emptyState}>
          <ShieldCheck />
          <h2>Monitor an extension before making a badge.</h2>
          <p>Badge Studio starts with your team watchlist so every shared claim has a release context and a return path when the next version ships.</p>
          <Link href="/registry">Find an extension <ArrowRight /></Link>
        </section>
      ) : (
        <section className={styles.createPanel}>
          <div className={styles.createCopy}>
            <span className={styles.eyebrow}><ScanSearch /> Exact-release badges</span>
          <h2>{selectedWatch?.source === "inventory" ? "Scan the installed release." : "Scan the watched release."}</h2>
          <p>We’ll reuse a completed report when one exists. Otherwise the isolated scanner runs once and keeps progress attached to this team badge.</p>
          </div>
          <div className={styles.createControls}>
            <label>
              Extension
            <select value={activeExtension} onChange={(event) => {
                const next = candidates.find((watch) => watch.extension_id === event.target.value);
                setSelectedExtension(event.target.value);
                setVersion(versionFor(next));
              }} disabled={!canCreate || saving}>
                {candidates.map((watch) => <option key={watch.extension_id} value={watch.extension_id}>{watchName(watch)} · {watch.extension_id}</option>)}
              </select>
            </label>
            <label>
              Exact version
              <input value={activeVersion} onChange={(event) => setVersion(event.target.value)} placeholder="1.2.3" disabled={!canCreate || saving} />
            </label>
            <button type="button" onClick={() => void syncBadge(activeExtension, activeVersion, false)} disabled={!canCreate || saving || !activeVersion.trim()}>
              {saving ? <LoaderCircle className={styles.spin} /> : <ScanSearch />}
              {saving ? "Preparing…" : "Scan latest release"}
            </button>
          </div>
          {!canCreate ? <p className={styles.roleNote}><ShieldCheck /> Viewers can copy and share ready badges. Ask an analyst or administrator to scan another release.</p> : null}
          {selectedWatch ? <small className={styles.selectionHint}>{selectedWatch.source === "inventory" ? "Inventory context" : "Monitoring context"}: {watchName(selectedWatch)} is currently at {versionFor(selectedWatch) || "an unreleased version"}.</small> : null}
        </section>
      )}

      {state === "error" ? <div className={styles.error} role="alert"><CircleAlert /> {message}</div> : null}
      {state !== "error" && message ? <div className={styles.message} role="status"><CheckCircle2 /> {message}</div> : null}

      <section className={styles.badgeList} aria-label="Team badges">
        <header>
          <div><span className={styles.eyebrow}>Shared trust assets</span><h2>Your release badges</h2></div>
          <small>{badges.length ? `${badges.length} exact release${badges.length === 1 ? "" : "s"}` : "No badges yet"}</small>
        </header>
        {badges.map((badge) => <BadgeCard key={badge.id} badge={badge} onCopy={copySnippet} onRefresh={(force = false) => {
          trackProductEvent({ name: "team_badge_refresh_intent", source_route: "/workspace", mode: "exact_release" });
          void syncBadge(badge.extension_id, nextVersionFor(badge, candidates), force);
        }} onMutate={mutateBadge} canCreate={canCreate} canManage={canManage} busy={mutatingId === badge.id} />)}
        {!badges.length ? <div className={styles.listEmpty}><ClipboardCheck /><strong>Your first badge belongs here.</strong><span>Choose a watched release above to create a score-backed trust signal for your README or release notes.</span></div> : null}
      </section>
      {copyMessage ? <p className={styles.copyStatus} role="status"><Copy /> {copyMessage}</p> : null}
    </>
  );
}

function BadgeCard({
  badge,
  onCopy,
  onRefresh,
  onMutate,
  canCreate,
  canManage,
  busy,
}: {
  badge: Badge;
  onCopy: (badge: Badge, kind: "markdown" | "html") => Promise<void>;
  onRefresh: (force?: boolean) => void;
  onMutate: (badge: Badge, action: "publish" | "unpublish" | "revoke") => Promise<void>;
  canCreate: boolean;
  canManage: boolean;
  busy: boolean;
}) {
  const status = badgeStatusCopy(badge.status);
  const ready = badge.status === "ready" || badge.status === "stale";
  const shareable = ready && badge.visibility === "public";
  return (
    <article className={styles.badgeCard}>
      <div className={styles.badgeIdentity}>
        <span className={styles.badgeIcon}><BadgeCheck /></span>
        <div><strong>{badge.display_name || badge.extension_id}</strong><small>{badge.extension_id} · <code>@{badge.version}</code></small></div>
      </div>
      <span className={`${styles.status} ${styles[badge.status]}`}><i /> {status}</span>
      <div className={styles.badgeFacts}>
        {shareable ? <>
          {/* Badge SVGs are dynamic, public assets; optimization would add no value here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badge.badge_url} alt={`GuardRails ${badge.extension_id} ${badge.version} badge`} height="20" />
        </> : badge.visibility === "private" && ready ? <span className={styles.pendingFact}><ShieldCheck /> Private badge · publish to embed</span> : <span className={styles.pendingFact}><LoaderCircle className={badge.status === "pending" ? styles.spin : ""} /> {badge.status === "failed" ? "Scan failed" : "Scan in progress"}</span>}
        <span><b>Risk</b> {score(badge.risk_score)}</span>
        <span><b>Malware</b> {score(badge.malware_score)}</span>
        <span><b>Coverage</b> {badge.coverage_percent === null ? "Unavailable" : `${badge.coverage_percent}%`}</span>
      </div>
      <p className={styles.badgeNote}>{badge.status === "stale" ? "Release changed — this badge remains pinned to the older release until you scan the new one." : badge.status === "pending" ? "The isolated scanner is preparing this exact release. You can safely leave and return later." : badge.status === "failed" ? badge.last_error || "The report did not complete. Retry from the watched release." : `Scanned ${formatDate(badge.scanned_at)} · ${badge.trust_label || "Analysis completed"}.`}</p>
      <footer className={styles.badgeActions}>
        {ready ? <Link href={badge.report_url} onClick={() => trackProductEvent({ name: "team_badge_report_opened", source_route: "/workspace", mode: "exact_release" })}>Open exact report <ArrowRight /></Link> : null}
        {shareable ? <button type="button" onClick={() => void onCopy(badge, "markdown")}><Copy /> Copy Markdown</button> : null}
        {shareable ? <button type="button" onClick={() => void onCopy(badge, "html")}><Copy /> Copy HTML</button> : null}
        {canManage && ready ? <button type="button" onClick={() => void onMutate(badge, badge.visibility === "public" ? "unpublish" : "publish")} disabled={busy}><ShieldCheck /> {badge.visibility === "public" ? "Make private" : "Publish badge"}</button> : null}
        {canManage && ready ? <button type="button" onClick={() => void onMutate(badge, "revoke")} disabled={busy}><CircleAlert /> Revoke</button> : null}
        {(badge.status === "stale" || badge.status === "failed") && canCreate ? <button type="button" onClick={() => onRefresh(badge.status === "failed")}><RefreshCw /> Refresh release</button> : null}
      </footer>
    </article>
  );
}

function watchName(watch: WatchItem | undefined): string {
  if (!watch) return "Watched extension";
  const relation = Array.isArray(watch.extensions) ? watch.extensions[0] : watch.extensions;
  return relation?.display_name || watch.extension_id;
}

function versionFor(watch: WatchItem | undefined): string {
  return String(watch?.last_observed_version || watch?.baseline_version || "").replace(/^v/, "");
}

function nextVersionFor(badge: Badge, watches: WatchItem[]): string {
  return versionFor(watches.find((watch) => watch.extension_id.toLowerCase() === badge.extension_id.toLowerCase())) || badge.version;
}

function score(value: number | null): string {
  return value === null ? "Unavailable" : `${value}/100`;
}

function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function formatDate(value: string | null): string {
  if (!value) return "time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function badgeStatusCopy(status: TeamBadgeStatus): string {
  return { pending: "Scanning", ready: "Ready to share", stale: "Release changed", failed: "Needs retry", revoked: "Revoked" }[status];
}
