"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  Blocks,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Command,
  Inbox,
  LayoutDashboard,
  Laptop,
  LogOut,
  Menu,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRound,
  X,
} from "lucide-react";
import BrandMark from "@/app/BrandMark";
import ExtensionSearch from "@/app/ExtensionSearch";
import NotificationCenter from "@/app/workspace/NotificationCenter";
import PermissionPassport from "@/app/extensions/PermissionPassport";
import PermissionDiffCard from "@/app/extensions/PermissionDiffCard";
import NotificationSettings, {
  type ChannelInput,
  type DigestDelivery,
  type NotificationChannel,
  type NotificationDelivery,
  type NotificationPreferences,
} from "@/app/workspace/NotificationSettings";
import BillingPanel from "@/app/workspace/BillingPanel";
import TeamInventoryPanel from "@/app/workspace/TeamInventoryPanel";
import BadgeStudioView from "@/app/workspace/views/BadgeStudioView";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";
import {
  groupDecisionQueue,
  type QueueDecision,
} from "@/lib/teamDecisionQueue";
import type { DiscoveryResult } from "@/lib/types";
import { buildPermissionPassport } from "@/lib/permissionPassport";
import styles from "@/app/workspace/teamWorkspace.module.css";

type Team = { id: string; name: string; slug: string; role: string };
type Delivery = {
  status: string;
  attempts: number;
  delivered_at: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
};
type Alert = {
  id: string;
  title: string;
  summary: string;
  severity: string | null;
  state: string;
  extension_id: string;
  version: string;
  team_notification_deliveries?: Delivery[];
};
type Member = {
  user_id: string;
  role: string;
  profiles?:
    | { display_name?: string | null }
    | Array<{ display_name?: string | null }>
    | null;
};
type WatchItem = {
  extension_id: string;
  created_at: string;
  baseline_version?: string | null;
  monitoring_state?: string;
  last_observed_version?: string | null;
  last_event_at?: string | null;
  extensions?:
    | { display_name?: string }
    | Array<{ display_name?: string }>
    | null;
};
type BadgeItem = {
  extension_id: string;
  status?: string;
  version?: string;
  risk_score?: number | null;
};
type MonitoringHealth = {
  status: "healthy" | "degraded" | "unknown";
  last_checked_at: string | null;
  next_check_at: string | null;
  cadence_hours: number;
  error: string | null;
};
type DecisionReceipt = {
  decisionId: string;
  eventId: string;
  decision: string;
  extensionId: string;
  version: string;
  rationale: string;
  recordedAt: string;
};
type DecisionSaveResult =
  | { ok: true; receipt: DecisionReceipt }
  | { ok: false; error: string };
type View =
  | "overview"
  | "inventory"
  | "inbox"
  | "extensions"
  | "badges"
  | "decisions"
  | "activity"
  | "settings";

const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["inventory", "Inventory", Laptop],
  ["inbox", "Review inbox", Inbox],
  ["extensions", "Extensions", Blocks],
  ["badges", "Badges", BadgeCheck],
  ["decisions", "Decisions", ShieldCheck],
  ["activity", "Activity", Activity],
] as const;
const defaultNotificationPreferences: NotificationPreferences = {
  release_alerts: true,
  scan_alerts: true,
  decision_alerts: true,
  high_evidence_alerts: true,
  provenance_alerts: true,
  coverage_alerts: true,
  due_alerts: true,
  weekly_digest: false,
  digest_weekday: 1,
  digest_hour_utc: 9,
};
const sampleDecisions: QueueDecision[] = [
  {
    id: "sample-cline",
    scan_id: "sample-scan",
    decision: "review",
    extension_id: "saoudrizwan.claude-dev",
    version: "3.19.0",
    assigned_to: null,
    due_at: "2026-08-07T17:00:00.000Z",
    resolved_at: null,
    updated_at: "2026-08-06T12:00:00.000Z",
  },
  {
    id: "sample-docker",
    scan_id: "sample-docker-scan",
    decision: "review",
    extension_id: "ms-azuretools.vscode-docker",
    version: "2.1.0",
    assigned_to: null,
    due_at: null,
    resolved_at: null,
    updated_at: "2026-08-06T10:00:00.000Z",
  },
];
const sampleWatches: WatchItem[] = [
  {
    extension_id: "saoudrizwan.claude-dev",
    created_at: "2026-07-12T00:00:00.000Z",
    baseline_version: "3.18.2",
    monitoring_state: "comparison_ready",
    extensions: { display_name: "Cline" },
  },
  {
    extension_id: "ms-python.python",
    created_at: "2026-07-10T00:00:00.000Z",
    baseline_version: "2026.5",
    monitoring_state: "monitoring",
    extensions: { display_name: "Python" },
  },
  {
    extension_id: "dbaeumer.vscode-eslint",
    created_at: "2026-07-09T00:00:00.000Z",
    baseline_version: "3.0.10",
    monitoring_state: "monitoring",
    extensions: { display_name: "ESLint" },
  },
];
const sampleAlerts: Alert[] = [
  {
    id: "sample-alert",
    title: "Cline added command and network access",
    summary:
      "Version 3.19.0 requests two capabilities that were not present in the reviewed baseline.",
    severity: "HIGH",
    state: "open",
    extension_id: "saoudrizwan.claude-dev",
    version: "3.19.0",
  },
];

export default function TeamWorkspace(
  props: { initialExtension?: string; focus?: "workspace" | "monitor" } = {},
) {
  const router = useRouter();
  const db = useMemo(() => browserDb(), []);
  const registryHref = props.initialExtension
    ? `/extensions/${encodeURIComponent(props.initialExtension)}`
    : "/registry";
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState("");
  const [view, setView] = useState<View>(
    props.focus === "monitor" ? "extensions" : "overview",
  );
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [decisions, setDecisions] = useState<QueueDecision[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [badgeItems, setBadgeItems] = useState<BadgeItem[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<
    NotificationChannel[]
  >([]);
  const [notificationDeliveries, setNotificationDeliveries] = useState<
    NotificationDelivery[]
  >([]);
  const [digestDeliveries, setDigestDeliveries] = useState<DigestDelivery[]>(
    [],
  );
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(defaultNotificationPreferences);
  const [notificationsConfigured, setNotificationsConfigured] = useState(false);
  const [dataState, setDataState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [setupTeamId, setSetupTeamId] = useState("");
  const [sampleMode, setSampleMode] = useState(false);
  const [monitoringHealth, setMonitoringHealth] = useState<MonitoringHealth>({
    status: "unknown",
    last_checked_at: null,
    next_check_at: null,
    cadence_hours: 6,
    error: null,
  });

  const getAuthHeaders = useCallback(() => browserAuthHeaders(db), [db]);
  const loadTeams = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const headers = await getAuthHeaders();
      const cloudflareResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const cloudflareSession = await cloudflareResponse.json().catch(() => ({}));
      let supabaseUser: { id?: string; email?: string } | null = null;
      if (!cloudflareSession.user) {
        try {
          supabaseUser = (await db?.auth.getUser())?.data.user || null;
        } catch {
          supabaseUser = null;
        }
      }
      const response = await fetch("/api/teams", {
        headers: headers.Authorization ? headers : undefined,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(body.error || "Your workspaces could not be loaded."),
        );
      const available = Array.isArray(body.teams) ? (body.teams as Team[]) : [];
      const first = available[0]?.id || "";
      const pending =
        available.find((team) =>
          window.localStorage.getItem(`guardrails:setup:${team.id}`),
        )?.id || "";
      setUserEmail(cloudflareSession.user?.email || supabaseUser?.email || "Signed-in user");
      setUserId(cloudflareSession.user?.id || supabaseUser?.id || "");
      setTeams(available);
      setActiveTeamId((current) => current || pending || first);
      setSetupTeamId(pending);
      setState("ready");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Workspace unavailable.",
      );
      setState("error");
    }
  }, [db, getAuthHeaders]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTeams(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTeams]);
  const loadWorkspace = useCallback(async () => {
    if (!activeTeamId) return;
    setDataState("loading");
    setAlerts([]);
    setDecisions([]);
    setMembers([]);
    setWatchItems([]);
    setBadgeItems([]);
    setNotificationChannels([]);
    setNotificationDeliveries([]);
    setDigestDeliveries([]);
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const base = `/api/teams/${encodeURIComponent(activeTeamId)}`;
      const responses = await Promise.all([
        fetch(`${base}/alerts`, { headers }),
        fetch(`${base}/decisions`, { headers }),
        fetch(`${base}/members`, { headers }),
        fetch(`${base}/watchlist`, { headers }),
        fetch(`${base}/notification-channels`, { headers }),
        fetch(`${base}/monitoring-preferences`, { headers }),
        fetch(`${base}/badges`, { headers }),
      ]);
      const bodies = await Promise.all(
        responses.map((response) => response.json().catch(() => ({}))),
      );
      if (responses.slice(0, 6).some((response) => !response.ok))
        throw new Error("Some workspace data could not be refreshed.");
      setAlerts(Array.isArray(bodies[0].alerts) ? bodies[0].alerts : []);
      setDecisions(
        Array.isArray(bodies[1].decisions) ? bodies[1].decisions : [],
      );
      setMembers(Array.isArray(bodies[2].members) ? bodies[2].members : []);
      setWatchItems(Array.isArray(bodies[3].items) ? bodies[3].items : []);
      if (bodies[3].health)
        setMonitoringHealth(bodies[3].health as MonitoringHealth);
      setNotificationChannels(
        Array.isArray(bodies[4].channels) ? bodies[4].channels : [],
      );
      setNotificationDeliveries(
        Array.isArray(bodies[4].deliveries) ? bodies[4].deliveries : [],
      );
      setDigestDeliveries(
        Array.isArray(bodies[4].digest_deliveries)
          ? bodies[4].digest_deliveries
          : [],
      );
      setNotificationsConfigured(bodies[4].configured === true);
      setNotificationPreferences({
        ...defaultNotificationPreferences,
        ...bodies[5],
      });
      // Badge Studio is an additive feature. A pending Supabase/D1 migration
      // must not blank the rest of an existing workspace during rollout.
      setBadgeItems(responses[6].ok && Array.isArray(bodies[6]?.badges) ? bodies[6].badges : []);
      setDataState("ready");
    } catch {
      setDataState("error");
    }
  }, [activeTeamId, getAuthHeaders]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function createTeam(name: string) {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/teams", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(String(body.error || "Workspace creation failed."));
    window.localStorage.setItem(
      `guardrails:setup:${body.id}`,
      "workspace-created",
    );
    setTeams((current) => [body, ...current]);
    setActiveTeamId(body.id);
    setSetupTeamId(body.id);
  }
  async function saveDecision(
    decision: QueueDecision,
    nextDecision: string,
    rationale = decision.rationale || "",
  ) {
    setSaveState("saving");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization)
        throw new Error("Your session expired. Sign in again before retrying.");
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/decisions`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scan_id: decision.scan_id,
            decision: nextDecision,
            rationale,
            assigned_to: decision.assigned_to || null,
            due_at: decision.due_at || null,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok)
        throw new Error(
          String(
            body.error || "The decision service did not accept this update.",
          ),
        );
      const audit =
        body.audit_receipt && typeof body.audit_receipt === "object"
          ? (body.audit_receipt as Record<string, unknown>)
          : {};
      const receipt: DecisionReceipt = {
        decisionId: String(body.id || decision.id),
        eventId: String(audit.event_id || "pending"),
        decision: String(body.decision || nextDecision),
        extensionId: String(body.extension_id || decision.extension_id),
        version: String(body.version || decision.version),
        rationale: String(body.rationale || rationale),
        recordedAt: String(
          audit.recorded_at || body.updated_at || new Date().toISOString(),
        ),
      };
      setDecisions((current) =>
        current.map((item) =>
          item.id === decision.id
            ? ({ ...item, ...body } as QueueDecision)
            : item,
        ),
      );
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2200);
      return { ok: true, receipt } satisfies DecisionSaveResult;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Decision could not be saved.";
      setSaveState("error");
      return { ok: false, error: message } satisfies DecisionSaveResult;
    }
  }
  async function signOut() {
    let cloudflareSignedIn = false;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      cloudflareSignedIn = Boolean((await response.json().catch(() => ({}))).user);
    } catch {
      cloudflareSignedIn = false;
    }
    if (cloudflareSignedIn) {
      await fetch("/api/auth/logout", { method: "POST" });
    } else {
      try {
        const headers = await getAuthHeaders();
        if (headers.Authorization && headers.Authorization !== "Bearer cloudflare-session") await db?.auth.signOut();
        else await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      }
    }
    router.replace("/");
  }

  async function mutateMember(memberId: string, role: string | null) {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization)
        throw new Error(
          "Your session expired. Sign in again before continuing.",
        );
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/members`,
        {
          method: role ? "PATCH" : "DELETE",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: memberId, role }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(body.error || "The membership change was not accepted."),
        );
      if (role) {
        setMembers((current) =>
          current.map((member) =>
            member.user_id === memberId ? { ...member, role } : member,
          ),
        );
        if (memberId === userId)
          setTeams((current) =>
            current.map((team) =>
              team.id === activeTeamId ? { ...team, role } : team,
            ),
          );
      } else {
        setMembers((current) =>
          current.filter((member) => member.user_id !== memberId),
        );
        if (memberId === userId) {
          setTeams((current) =>
            current.filter((team) => team.id !== activeTeamId),
          );
          setActiveTeamId("");
          await loadTeams();
        }
      }
      return { ok: true as const };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : "The membership change could not be completed.",
      };
    }
  }

  async function createMemberInvite(role: string) {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization)
        throw new Error(
          "Your session expired. Sign in again before continuing.",
        );
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/invites`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role, expires_in_days: 7 }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(body.error || "The invitation could not be created."),
        );
      return {
        ok: true as const,
        url: `${window.location.origin}${body.invitation_path}`,
      };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : "The invitation could not be created.",
      };
    }
  }

  async function saveNotificationPreference(
    field: keyof NotificationPreferences,
    value: boolean | number,
  ) {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization)
        throw new Error(
          "Your session expired. Sign in again before continuing.",
        );
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/monitoring-preferences`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ [field]: value }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(body.error || "The notification rule could not be updated."),
        );
      setNotificationPreferences((current) => ({ ...current, [field]: value }));
      return { ok: true as const };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : "The notification rule could not be updated.",
      };
    }
  }

  async function createNotificationChannel(input: ChannelInput) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/notification-channels`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(
            body.error || "The notification channel could not be connected.",
          ),
        );
      setNotificationChannels((current) => [
        ...current,
        body as NotificationChannel,
      ]);
      return { ok: true as const };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : "The notification channel could not be connected.",
      };
    }
  }

  async function deleteNotificationChannel(channelId: string) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/notification-channels?channel_id=${encodeURIComponent(channelId)}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          String(body.error || "The channel could not be removed."),
        );
      }
      setNotificationChannels((current) =>
        current.filter((channel) => channel.id !== channelId),
      );
      setNotificationDeliveries((current) =>
        current.filter((delivery) => delivery.channel_id !== channelId),
      );
      setDigestDeliveries((current) =>
        current.filter((delivery) => delivery.channel_id !== channelId),
      );
      return { ok: true as const };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error
            ? cause.message
            : "The channel could not be removed.",
      };
    }
  }

  async function testNotificationChannel(channelId: string) {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization)
        throw new Error("Your session expired. Sign in again before continuing.");
      const response = await fetch(
        `/api/teams/${encodeURIComponent(activeTeamId)}/notification-channels/${encodeURIComponent(channelId)}/test`,
        { method: "POST", headers },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = String(body.error || "The test delivery failed.");
        setNotificationChannels((current) =>
          current.map((channel) =>
            channel.id === channelId
              ? { ...channel, last_error: error }
              : channel,
          ),
        );
        throw new Error(error);
      }
      setNotificationChannels((current) =>
        current.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                last_error: null,
                last_validated_at: String(body.delivered_at),
              }
            : channel,
        ),
      );
      return { ok: true as const };
    } catch (cause) {
      return {
        ok: false as const,
        error:
          cause instanceof Error ? cause.message : "The test delivery failed.",
      };
    }
  }

  if (state === "loading") return <WorkspaceLoading />;
  if (state === "error")
    return (
      <main className={styles.recovery}>
        <CircleAlert />
        <h1>We couldn’t open your workspace.</h1>
        <p>{error}</p>
        <button onClick={() => void loadTeams()}>
          <RefreshCw /> Try again
        </button>
        <Link href="/account?next=/workspace">Sign in again</Link>
      </main>
    );
  if (!teams.length)
    return (
      <WorkspaceOnboarding
        email={userEmail}
        onCreate={createTeam}
        onSignOut={signOut}
      />
    );

  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0];
  const openDecisions = decisions.filter((item) => item.decision === "review");
  const canDecide = ["owner", "admin", "analyst"].includes(activeTeam.role);
  const overdue = openDecisions.filter(
    (item) => item.due_at && new Date(item.due_at) < new Date(),
  ).length;
  const failedDeliveries = alerts.filter((alert) =>
    alert.team_notification_deliveries?.some(
      (delivery) => delivery.status === "failed",
    ),
  ).length;

  if (setupTeamId === activeTeam.id)
    return (
      <WorkspaceSetup
        team={activeTeam}
        email={userEmail}
        getAuthHeaders={getAuthHeaders}
        onSignOut={signOut}
        onComplete={async () => {
          window.localStorage.removeItem(`guardrails:setup:${activeTeam.id}`);
          setSetupTeamId("");
          await loadWorkspace();
        }}
      />
    );

  return (
    <div className={styles.app}>
      <aside
        className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.brand}>
          <BrandMark />
          <strong>GuardRails</strong>
          <button
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X />
          </button>
        </div>
        <WorkspaceSwitcher
          teams={teams}
          active={activeTeam}
          onChange={setActiveTeamId}
        />
        <nav aria-label="Workspace navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? styles.navActive : ""}
              onClick={() => {
                setView(id);
                setMobileNav(false);
              }}
            >
              <Icon />
              <span>{label}</span>
              {id === "inbox" && openDecisions.length ? (
                <em>{openDecisions.length}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button
            className={view === "settings" ? styles.navActive : ""}
            onClick={() => {
              setView("settings");
              setMobileNav(false);
            }}
          >
            <Settings />
            <span>Settings</span>
          </button>
          <button>
            <Command />
            <span>Command menu</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className={styles.account}>
            <span>{initials(userEmail)}</span>
            <div>
              <strong>{userEmail.split("@")[0]}</strong>
              <small>
                {activeTeam.role} · {userEmail}
              </small>
            </div>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav ? (
        <button
          className={styles.scrim}
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={styles.menuButton}
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className={styles.search}>
            <Search />
            <span>Search extensions, decisions, or people…</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className={styles.topActions}>
            <button
              aria-label="Notifications"
              aria-expanded={notificationOpen}
              onClick={() => setNotificationOpen((value) => !value)}
            >
              <Bell />
              {alerts.length ? <i /> : null}
            </button>
            <Link href={registryHref}>
              <Plus /> Add extension
            </Link>
          </div>
        </header>
        {notificationOpen ? (
          <NotificationCenter
            alerts={alerts}
            onClose={() => setNotificationOpen(false)}
            onOpenActivity={() => {
              setView("activity");
              setNotificationOpen(false);
            }}
          />
        ) : null}
        <div className={styles.content}>
          {dataState === "error" ? (
            <div className={styles.dataError}>
              <CircleAlert />
              <span>Some workspace data could not be refreshed.</span>
              <button onClick={() => void loadWorkspace()}>Try again</button>
            </div>
          ) : null}
          {view === "overview" ? (
            <Overview
              team={activeTeam}
              decisions={sampleMode ? sampleDecisions : openDecisions}
              alerts={sampleMode ? sampleAlerts : alerts}
              watches={sampleMode ? sampleWatches : watchItems}
              badges={sampleMode ? [] : badgeItems}
              health={
                sampleMode
                  ? {
                      status: "healthy",
                      last_checked_at: "2026-08-06T12:17:00.000Z",
                      next_check_at: "2026-08-06T18:17:00.000Z",
                      cadence_hours: 6,
                      error: null,
                    }
                  : monitoringHealth
              }
              overdue={sampleMode ? 1 : overdue}
              failed={
                failedDeliveries +
                (sampleMode
                  ? 0
                  : monitoringHealth.status === "degraded"
                    ? 1
                    : 0)
              }
              loading={dataState === "loading"}
              sampleMode={sampleMode}
              onSample={setSampleMode}
              onNavigate={setView}
            />
          ) : null}
          {view === "inbox" ? (
            <ReviewInbox
              key={`${activeTeam.id}:${userId}`}
              decisions={openDecisions}
              members={members}
              currentUserId={userId}
              teamId={activeTeam.id}
              canDecide={canDecide}
              saveState={saveState}
              onSave={saveDecision}
            />
          ) : null}
          {view === "inventory" ? (
            <TeamInventoryPanel
              key={activeTeam.id}
              teamId={activeTeam.id}
              role={activeTeam.role}
              getAuthHeaders={getAuthHeaders}
            />
          ) : null}
          {view === "extensions" ? (
            <ExtensionsView
              watches={watchItems}
              badges={badgeItems}
              health={monitoringHealth}
              onRefresh={loadWorkspace}
            />
          ) : null}
          {view === "badges" ? (
            <BadgeStudioView
              key={activeTeam.id}
              teamId={activeTeam.id}
              teamSlug={activeTeam.slug}
              role={activeTeam.role}
              watches={watchItems}
              initialExtension={props.initialExtension}
              getAuthHeaders={getAuthHeaders}
            />
          ) : null}
          {view === "decisions" ? (
            <DecisionsView decisions={decisions} />
          ) : null}
          {view === "activity" ? (
            <ActivityView
              alerts={alerts}
              decisions={decisions}
              members={members}
              teamId={activeTeam.id}
              getAuthHeaders={getAuthHeaders}
              role={activeTeam.role}
            />
          ) : null}
          {view === "settings" ? (
            <SettingsView
              team={activeTeam}
              members={members}
              currentUserId={userId}
              onMutateMember={mutateMember}
              onCreateInvite={createMemberInvite}
              getAuthHeaders={getAuthHeaders}
              notificationSettings={
                <NotificationSettings
                  configured={notificationsConfigured}
                  channels={notificationChannels}
                  deliveries={notificationDeliveries}
                  digestDeliveries={digestDeliveries}
                  preferences={notificationPreferences}
                  digestPreview={{
                    monitored: watchItems.length,
                    changes: alerts.length,
                    needsReview: openDecisions.length,
                  }}
                  canManage={
                    activeTeam.role === "owner" || activeTeam.role === "admin"
                  }
                  onSavePreference={saveNotificationPreference}
                  onCreateChannel={createNotificationChannel}
                  onDeleteChannel={deleteNotificationChannel}
                  onTestChannel={testNotificationChannel}
                />
              }
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function WorkspaceSwitcher({
  teams,
  active,
  onChange,
}: {
  teams: Team[];
  active: Team;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.switcherWrap}>
      <button
        className={styles.switcher}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{initials(active.name)}</span>
        <div>
          <strong>{active.name}</strong>
          <small>{roleName(active.role)}</small>
        </div>
        <ChevronDown />
      </button>
      {open ? (
        <div
          className={styles.switcherMenu}
          role="listbox"
          aria-label="Switch workspace"
        >
          {teams.map((team) => (
            <button
              type="button"
              role="option"
              aria-selected={team.id === active.id}
              key={team.id}
              onClick={() => {
                onChange(team.id);
                setOpen(false);
              }}
            >
              <span>{initials(team.name)}</span>
              <div>
                <strong>{team.name}</strong>
                <small>{roleName(team.role)}</small>
              </div>
              {team.id === active.id ? <CheckCircle2 /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function WorkspaceLoading() {
  return (
    <main className={styles.loading}>
      <div className={styles.loadingBrand}>
        <BrandMark />
        <strong>GuardRails</strong>
      </div>
      <div>
        <span />
        <span />
        <span />
      </div>
      <p>Preparing your security workspace…</p>
    </main>
  );
}
function WorkspaceOnboarding({
  email,
  onCreate,
  onSignOut,
}: {
  email: string;
  onCreate: (name: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onCreate(name.trim());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create workspace.",
      );
      setSaving(false);
    }
  }
  return (
    <main className={styles.onboarding}>
      <header>
        <div>
          <BrandMark />
          <strong>GuardRails</strong>
        </div>
        <button onClick={() => void onSignOut()}>
          <LogOut /> Sign out
        </button>
      </header>
      <section>
        <span className={styles.step}>Step 1 of 3</span>
        <div className={styles.onboardingIcon}>
          <ShieldCheck />
        </div>
        <h1>Set up your first release review.</h1>
        <p>
          Name the workspace, anchor the first exact extension release you want
          to monitor, and invite the person who will review changes.
        </p>
        <form onSubmit={submit}>
          <label>
            Workspace name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Engineering"
              maxLength={80}
            />
          </label>
          <button disabled={saving || !name.trim()}>
            {saving ? "Creating workspace…" : "Continue"}
            <ArrowRight />
          </button>
          {error ? <small>{error}</small> : null}
        </form>
        <div className={styles.onboardingPromise}>
          <span>
            <CheckCircle2 /> Exact release baselines
          </span>
          <span>
            <CheckCircle2 /> Meaningful change alerts
          </span>
          <span>
            <CheckCircle2 /> Auditable team decisions
          </span>
        </div>
        <small>Signed in as {email}</small>
      </section>
    </main>
  );
}

function WorkspaceSetup({
  team,
  email,
  getAuthHeaders,
  onSignOut,
  onComplete,
}: {
  team: Team;
  email: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onSignOut: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<DiscoveryResult | null>(null);
  const [baseline, setBaseline] = useState<{
    version: string;
    state: "current" | "pending";
  } | null>(null);
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviteUrl, setInviteUrl] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [delivery, setDelivery] = useState<"in-app" | "email">("in-app");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function addExtension() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const productResponse = await fetch(
        `/api/extensions/${encodeURIComponent(selected.extension_id)}`,
      );
      const product = await productResponse.json().catch(() => ({}));
      if (!productResponse.ok)
        throw new Error(
          String(
            product.error ||
              "This extension could not be prepared for monitoring.",
          ),
        );
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
        `/api/teams/${encodeURIComponent(team.id)}/watchlist`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok && payload.baseline_scan_id) {
        delete payload.baseline_scan_id;
        response = await fetch(
          `/api/teams/${encodeURIComponent(team.id)}/watchlist`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(
            body.error || "This extension could not be added to monitoring.",
          ),
        );
      setBaseline({
        version: String(body.baseline_version || selected.version),
        state: body.monitoring_state === "monitoring" ? "current" : "pending",
      });
      window.localStorage.setItem(
        `guardrails:setup:${team.id}`,
        "extension-added",
      );
      setStep(2);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the extension.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createSetupInvite() {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(
        `/api/teams/${encodeURIComponent(team.id)}/invites`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: inviteRole, expires_in_days: 7 }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          String(body.error || "Invitation could not be created."),
        );
      setInviteUrl(`${window.location.origin}${body.invitation_path}`);
      window.localStorage.setItem(
        `guardrails:setup:${team.id}`,
        "teammate-invited",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invitation could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveDelivery() {
    if (delivery === "email" && notificationEmail.trim()) {
      setSaving(true);
      setError("");
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
        const response = await fetch(
          `/api/teams/${encodeURIComponent(team.id)}/notification-channels`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              kind: "email_resend",
              label: "Security updates",
              email: notificationEmail.trim(),
              minimum_severity: "MEDIUM",
            }),
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            String(
              body.error ||
                "Email could not be connected. You can continue with in-app notifications.",
            ),
          );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Email could not be connected.",
        );
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    window.localStorage.setItem(
      `guardrails:setup:${team.id}`,
      "notifications-set",
    );
    setStep(5);
  }
  const labels = [
    "First extension",
    "Baseline",
    "Teammate",
    "Notifications",
    "Ready",
  ];
  return (
    <main className={styles.setup}>
      <header>
        <div>
          <BrandMark />
          <strong>GuardRails</strong>
        </div>
        <span>{team.name}</span>
        <button onClick={() => void onSignOut()}>
          <LogOut /> Sign out
        </button>
      </header>
      <div className={styles.setupLayout}>
        <aside>
          <span>Workspace setup</span>
          <h2>Anchor your first release baseline.</h2>
          <ol>
            {labels.map((label, index) => (
              <li
                className={
                  step === index + 1
                    ? styles.setupActive
                    : step > index + 1
                      ? styles.setupDone
                      : ""
                }
                key={label}
              >
                <i>{step > index + 1 ? <CheckCircle2 /> : index + 1}</i>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <small>Progress is saved for this browser.</small>
        </aside>
        <section className={styles.setupCard}>
          {step === 1 ? (
            <>
              <SetupHeading
                number="01"
                title="Choose your first extension."
                body="Search for an extension your team already uses. GuardRails will attach monitoring to the exact available report."
              />
              <div className={styles.setupSearch}>
                <ExtensionSearch
                  onSelect={setSelected}
                  submitLabel="Find extension"
                />
              </div>
              {selected ? (
                <div className={styles.selectedSetupExtension}>
                  <span>{initials(selected.display_name)}</span>
                  <div>
                    <strong>{selected.display_name}</strong>
                    <code>
                      {selected.extension_id}@{selected.version}
                    </code>
                  </div>
                  <CheckCircle2 />
                </div>
              ) : null}
              <SetupError error={error} />
              <footer>
                <button
                  disabled={!selected || saving}
                  onClick={() => void addExtension()}
                >
                  {saving ? "Adding extension…" : "Add and continue"}
                  <ArrowRight />
                </button>
              </footer>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <SetupHeading
                number="02"
                title={
                  baseline?.state === "current"
                    ? "Your baseline is ready."
                    : "Your baseline is being prepared."
                }
                body={
                  baseline?.state === "current"
                    ? `GuardRails will compare future releases with ${selected?.display_name} ${baseline.version}.`
                    : `${selected?.display_name} is now watched. Its first complete report will become the baseline before any update is approved.`
                }
              />
              <div className={styles.baselineCard}>
                <ShieldCheck />
                <div>
                  <span>
                    {baseline?.state === "current"
                      ? "Protected baseline"
                      : "Baseline pending"}
                  </span>
                  <strong>
                    {selected?.extension_id}@{baseline?.version}
                  </strong>
                  <p>
                    {baseline?.state === "current"
                      ? "New releases will be scanned and compared with this exact package."
                      : "Monitoring is active; incomplete analysis will never be presented as approval."}
                  </p>
                </div>
              </div>
              <footer>
                <button onClick={() => setStep(3)}>
                  Continue <ArrowRight />
                </button>
              </footer>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <SetupHeading
                number="03"
                title="Invite the person who will review changes."
                body="Create an auditable, seven-day invitation. You can skip this and invite teammates later."
              />
              <div className={styles.setupForm}>
                <label>
                  Role
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                  >
                    <option value="analyst">Security analyst</option>
                    <option value="admin">Administrator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <button
                  disabled={saving || Boolean(inviteUrl)}
                  onClick={() => void createSetupInvite()}
                >
                  {inviteUrl
                    ? "Invitation created"
                    : saving
                      ? "Creating…"
                      : "Create invitation"}
                </button>
                {inviteUrl ? (
                  <label>
                    Share this link
                    <input
                      readOnly
                      value={inviteUrl}
                      onFocus={(event) => event.target.select()}
                    />
                  </label>
                ) : null}
              </div>
              <SetupError error={error} />
              <footer>
                <button
                  className={styles.setupSecondary}
                  onClick={() => setStep(4)}
                >
                  {inviteUrl ? "Continue" : "Skip for now"}
                </button>
                {inviteUrl ? (
                  <button onClick={() => setStep(4)}>
                    Continue <ArrowRight />
                  </button>
                ) : null}
              </footer>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <SetupHeading
                number="04"
                title="Choose how GuardRails brings you back."
                body="In-app notifications are always available. Add email now, or connect Slack, Jira, and webhooks later in settings."
              />
              <div className={styles.deliveryOptions}>
                <button
                  className={delivery === "in-app" ? styles.deliveryActive : ""}
                  onClick={() => setDelivery("in-app")}
                >
                  <Bell />
                  <span>
                    <strong>In-app only</strong>
                    <small>See changes in the review inbox.</small>
                  </span>
                  <CheckCircle2 />
                </button>
                <button
                  className={delivery === "email" ? styles.deliveryActive : ""}
                  onClick={() => setDelivery("email")}
                >
                  <Bell />
                  <span>
                    <strong>Email + in-app</strong>
                    <small>
                      Send meaningful changes to a security mailbox.
                    </small>
                  </span>
                  <CheckCircle2 />
                </button>
              </div>
              {delivery === "email" ? (
                <label className={styles.emailField}>
                  Security mailbox
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(event) =>
                      setNotificationEmail(event.target.value)
                    }
                    placeholder="security@example.com"
                  />
                </label>
              ) : null}
              <SetupError error={error} />
              <footer>
                <button
                  disabled={
                    saving ||
                    (delivery === "email" && !notificationEmail.trim())
                  }
                  onClick={() => void saveDelivery()}
                >
                  {saving ? "Connecting…" : "Finish setup"}
                  <ArrowRight />
                </button>
              </footer>
            </>
          ) : null}
          {step === 5 ? (
            <>
              <div className={styles.setupSuccess}>
                <span>
                  <CheckCircle2 />
                </span>
                <small>Workspace ready</small>
                <h1>{team.name} is monitoring its first extension.</h1>
                <p>
                  GuardRails will return new releases to your review inbox only
                  when there is a decision to make.
                </p>
                <div>
                  <strong>
                    <CheckCircle2 /> {selected?.display_name} monitored
                  </strong>
                  <strong>
                    <CheckCircle2 />{" "}
                    {baseline?.state === "current"
                      ? "Exact baseline established"
                      : "Baseline queued"}
                  </strong>
                  <strong>
                    <CheckCircle2 />{" "}
                    {inviteUrl
                      ? "Teammate invitation created"
                      : "Team invitations available later"}
                  </strong>
                  <strong>
                    <CheckCircle2 />{" "}
                    {delivery === "email"
                      ? "Email notifications connected"
                      : "In-app notifications active"}
                  </strong>
                </div>
              </div>
              <footer>
                <button onClick={() => void onComplete()}>
                  Open workspace <ArrowRight />
                </button>
              </footer>
            </>
          ) : null}
        </section>
      </div>
      <small className={styles.setupAccount}>Signed in as {email}</small>
    </main>
  );
}
function SetupHeading({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <header className={styles.setupHeading}>
      <span>{number} · Guided setup</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </header>
  );
}
function SetupError({ error }: { error: string }) {
  return error ? (
    <p className={styles.setupError}>
      <CircleAlert />
      {error}
    </p>
  ) : null;
}

function PageTitle({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.pageTitle}>
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </header>
  );
}
function Overview({
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
  badges: Array<{ extension_id?: string; status?: string }>;
  health: MonitoringHealth;
  overdue: number;
  failed: number;
  loading: boolean;
  sampleMode: boolean;
  onSample: (value: boolean) => void;
  onNavigate: (view: View) => void;
}) {
  const watchedExtensions = new Set(
    watches.map((watch) => watch.extension_id.toLowerCase()),
  );
  const badgeExtensions = new Set(
    badges
      .filter((badge) => ["ready", "stale"].includes(badge.status || ""))
      .map((badge) => String(badge.extension_id || "").toLowerCase())
      .filter(Boolean),
  );
  const coveredExtensions = [...watchedExtensions].filter((extensionId) =>
    badgeExtensions.has(extensionId),
  ).length;
  const staleBadge = badges.some((badge) => badge.status === "stale");
  const uncoveredExtensions = Math.max(0, watchedExtensions.size - coveredExtensions);
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
          value={`${coveredExtensions}/${watchedExtensions.size}`}
          detail={staleBadge ? "A release needs refresh" : uncoveredExtensions ? `${uncoveredExtensions} watched release${uncoveredExtensions === 1 ? " needs" : "s need"} a badge` : "Every watched release is covered"}
          tone={staleBadge || uncoveredExtensions ? "amber" : "green"}
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
function EmptyReview() {
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
function QueueSkeleton() {
  return (
    <div className={styles.skeleton}>
      <span />
      <span />
      <span />
    </div>
  );
}

type ReviewFilter = "open" | "mine" | "unassigned" | "overdue";
const reviewFilters: Array<{ id: ReviewFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "overdue", label: "Overdue" },
];

function isReviewFilter(value: unknown): value is ReviewFilter {
  return reviewFilters.some((filter) => filter.id === value);
}

function filterReviewDecisions(
  decisions: QueueDecision[],
  filter: ReviewFilter,
  currentUserId: string,
) {
  if (filter === "mine")
    return decisions.filter(
      (decision) => decision.assigned_to === currentUserId,
    );
  if (filter === "unassigned")
    return decisions.filter((decision) => !decision.assigned_to);
  if (filter === "overdue") {
    const now = Date.now();
    return decisions.filter(
      (decision) =>
        decision.due_at && new Date(decision.due_at).getTime() < now,
    );
  }
  return decisions;
}

function persistReviewFilters(
  key: string,
  active: ReviewFilter,
  saved: ReviewFilter[],
) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ active, saved }));
  } catch {
    // Filtering still works when storage is unavailable in a restricted browser.
  }
}

function readReviewFilters(key: string): {
  active: ReviewFilter;
  saved: ReviewFilter[];
} {
  if (typeof window === "undefined") return { active: "open", saved: [] };
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "{}");
    return {
      active: isReviewFilter(stored.active) ? stored.active : "open",
      saved: Array.isArray(stored.saved)
        ? stored.saved.filter(isReviewFilter)
        : [],
    };
  } catch {
    return { active: "open", saved: [] };
  }
}

function ReviewInbox({
  decisions,
  members,
  currentUserId,
  teamId,
  canDecide,
  saveState,
  onSave,
}: {
  decisions: QueueDecision[];
  members: Member[];
  currentUserId: string;
  teamId: string;
  canDecide: boolean;
  saveState: string;
  onSave: (
    d: QueueDecision,
    v: string,
    rationale?: string,
  ) => Promise<DecisionSaveResult>;
}) {
  const [selected, setSelected] = useState<QueueDecision | null>(null);
  const storageKey = `guardrails:review-filters:${teamId}:${currentUserId}`;
  const [filterState, setFilterState] = useState<{
    active: ReviewFilter;
    saved: ReviewFilter[];
  }>({ active: "open", saved: [] });
  const { active: activeFilter, saved: savedFilters } = filterState;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilterState(readReviewFilters(storageKey)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  const filteredDecisions = filterReviewDecisions(
    decisions,
    activeFilter,
    currentUserId,
  );
  const counts = Object.fromEntries(
    reviewFilters.map(({ id }) => [
      id,
      filterReviewDecisions(decisions, id, currentUserId).length,
    ]),
  ) as Record<ReviewFilter, number>;
  function chooseFilter(filter: ReviewFilter) {
    setFilterState((current) => ({ ...current, active: filter }));
    persistReviewFilters(storageKey, filter, savedFilters);
  }
  function saveCurrentFilter() {
    const next = savedFilters.includes(activeFilter)
      ? savedFilters
      : [...savedFilters, activeFilter];
    setFilterState({ active: activeFilter, saved: next });
    persistReviewFilters(storageKey, activeFilter, next);
  }
  function removeSavedFilter(filter: ReviewFilter) {
    const next = savedFilters.filter((item) => item !== filter);
    setFilterState({ active: activeFilter, saved: next });
    persistReviewFilters(storageKey, activeFilter, next);
  }
  return (
    <>
      <PageTitle
        eyebrow="Review inbox"
        title="Review the update, then decide."
        copy="Prioritized extension releases, connected to their exact evidence and owner."
        action={
          <Link className={styles.primaryAction} href="/registry">
            <Plus /> Add extension
          </Link>
        }
      />
      <div className={styles.filterBar}>
        {reviewFilters.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeFilter === id}
            className={activeFilter === id ? styles.filterActive : ""}
            onClick={() => chooseFilter(id)}
          >
            {label} <span>{counts[id]}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.saveFilter}
          disabled={savedFilters.includes(activeFilter)}
          onClick={saveCurrentFilter}
        >
          <Plus />{" "}
          {savedFilters.includes(activeFilter) ? "View saved" : "Save view"}
        </button>
      </div>
      {savedFilters.length ? (
        <div className={styles.savedFilters} aria-label="Saved review views">
          <strong>Saved views</strong>
          {savedFilters.map((filter) => (
            <span key={filter}>
              <button type="button" onClick={() => chooseFilter(filter)}>
                {reviewFilters.find((item) => item.id === filter)?.label}
              </button>
              <button
                type="button"
                aria-label={`Remove ${filter} saved view`}
                onClick={() => removeSavedFilter(filter)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <section className={styles.inboxList}>
        {filteredDecisions.length ? (
          filteredDecisions.map((decision, index) => (
            <article key={decision.id} className={styles.inboxCard}>
              <div className={styles.inboxIdentity}>
                <div className={styles.extensionAvatar}>
                  {initials(decision.extension_id)}
                </div>
                <div>
                  <span>
                    {index === 0 ? "High priority" : "Ready for review"}
                  </span>
                  <h2>{decision.extension_id}</h2>
                  <code>Release @{decision.version}</code>
                </div>
              </div>
              <div className={styles.changeSummary}>
                <span>Why it matters</span>
                <strong>
                  {index === 0
                    ? "New behavior was detected in this release."
                    : "The new package is ready for comparison."}
                </strong>
                <p>
                  Review files, commands, connections, and permission changes
                  before recording the decision.
                </p>
              </div>
              <div className={styles.inboxMeta}>
                <span>
                  <UserRound />{" "}
                  {decision.assigned_to
                    ? memberLabel(members, decision.assigned_to)
                    : "Unassigned"}
                </span>
                <span>
                  <Radar /> Evidence ready
                </span>
              </div>
              <div className={styles.inboxActions}>
                <button
                  className={styles.reviewButton}
                  onClick={() => setSelected(decision)}
                >
                  Review release <ArrowRight />
                </button>
                <Link
                  href={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
                >
                  Open full evidence
                </Link>
              </div>
            </article>
          ))
        ) : activeFilter === "mine" ? (
          <div className={styles.personalEmpty}>
            <UserRound />
            <h2>Nothing is assigned to you.</h2>
            <p>
              Your personal queue is clear. Open another saved view or ask a
              workspace owner to assign a release.
            </p>
            <button type="button" onClick={() => chooseFilter("open")}>
              View every open review
            </button>
          </div>
        ) : (
          <EmptyReview />
        )}
      </section>
      {selected ? (
        <ReviewDecisionPanel
          decision={selected}
          members={members}
          canDecide={canDecide}
          saveState={saveState}
          onClose={() => setSelected(null)}
          onSave={(value, rationale) => onSave(selected, value, rationale)}
        />
      ) : null}
      {saveState !== "idle" ? (
        <div
          className={`${styles.toast} ${saveState === "error" ? styles.toastError : ""}`}
        >
          {saveState === "saving"
            ? "Recording decision…"
            : saveState === "saved"
              ? "Decision recorded and added to the audit trail."
              : "Decision could not be saved. Your rationale is still here."}
        </div>
      ) : null}
    </>
  );
}

function ReviewDecisionPanel({
  decision,
  members,
  canDecide,
  saveState,
  onClose,
  onSave,
}: {
  decision: QueueDecision;
  members: Member[];
  canDecide: boolean;
  saveState: string;
  onClose: () => void;
  onSave: (value: string, rationale: string) => Promise<DecisionSaveResult>;
}) {
  const [rationale, setRationale] = useState(decision.rationale || "");
  const [attempt, setAttempt] = useState<{
    value: string;
    rationale: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<DecisionReceipt | null>(null);
  const [saveError, setSaveError] = useState("");
  async function submit(value: string, text: string) {
    const next = { value, rationale: text };
    setAttempt(next);
    setSaveError("");
    const result = await onSave(value, text);
    if (result.ok) setReceipt(result.receipt);
    else setSaveError(result.error);
  }
  return (
    <div
      className={styles.reviewOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.reviewPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-panel-heading"
      >
        <header>
          <div>
            <span>{receipt ? "Decision receipt" : "Exact release review"}</span>
            <h2 id="review-panel-heading">{decision.extension_id}</h2>
            <code>@{decision.version}</code>
          </div>
          <button onClick={onClose} aria-label="Close release review">
            <X />
          </button>
        </header>
        {receipt ? (
          <DecisionReceiptView receipt={receipt} />
        ) : (
          <>
            <div className={styles.reviewPanelBody}>
              <div className={styles.reviewWhy}>
                <span>Why this needs attention</span>
                <h3>Confirm the new package behavior before rollout.</h3>
                <p>
                  GuardRails keeps this decision attached to version{" "}
                  {decision.version}. Future releases must be reviewed
                  separately.
                </p>
                <Link
                  href={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
                >
                  Open files, commands, and network evidence <ArrowRight />
                </Link>
              </div>
              <div className={styles.reviewFacts}>
                <span>
                  <UserRound />
                  <b>Owner</b>
                  {decision.assigned_to
                    ? memberLabel(members, decision.assigned_to)
                    : "Unassigned"}
                </span>
                <span>
                  <Clock3 />
                  <b>Due</b>
                  {decision.due_at
                    ? new Date(decision.due_at).toLocaleDateString()
                    : "No due date"}
                </span>
                <span>
                  <ShieldCheck />
                  <b>Current state</b>
                  {humanize(decision.decision)}
                </span>
              </div>
              <PermissionPassport
                compact
                passport={buildPermissionPassport({
                  extensionId: decision.extension_id,
                  version: decision.version,
                  latestVersion: decision.version,
                  scan: decisionScan(decision),
                })}
                reportHref={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
              />
              <PermissionDiffCard
                compact
                extensionId={decision.extension_id}
                currentVersion={decision.version}
              />
              {canDecide ? (
                <label className={styles.rationaleField}>
                  <span>
                    Decision rationale <b>Required</b>
                  </span>
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    placeholder="Explain why this release is allowed, blocked, or receiving an exception."
                    maxLength={1200}
                  />
                  <small>
                    {rationale.trim().length}/1200 · Saved with the audit record
                  </small>
                </label>
              ) : (
                <div className={styles.readOnlyNotice}>
                  Your Viewer role can inspect evidence but cannot record a
                  decision.
                </div>
              )}
              {saveError ? (
                <div className={styles.reviewSaveError} role="alert">
                  <CircleAlert />
                  <span>
                    <strong>Decision not recorded</strong>
                    {saveError}
                    <small>
                      Your rationale was preserved. You can retry without
                      retyping it.
                    </small>
                  </span>
                  {attempt ? (
                    <button
                      onClick={() =>
                        void submit(attempt.value, attempt.rationale)
                      }
                      disabled={saveState === "saving"}
                    >
                      <RotateCcw /> Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <footer>
              <button onClick={onClose}>Cancel</button>
              {canDecide ? (
                <div>
                  <button
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("exception", rationale.trim())}
                  >
                    Exception
                  </button>
                  <button
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("block", rationale.trim())}
                  >
                    Block release
                  </button>
                  <button
                    className={styles.allowDecision}
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("allow", rationale.trim())}
                  >
                    Allow release
                  </button>
                </div>
              ) : null}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function DecisionReceiptView({ receipt }: { receipt: DecisionReceipt }) {
  return (
    <>
      <div className={styles.receipt}>
        <span className={styles.receiptIcon}>
          <ClipboardCheck />
        </span>
        <div className={styles.receiptHeading}>
          <span>Recorded successfully</span>
          <h3>{humanize(receipt.decision)} for this exact release</h3>
          <p>
            This receipt proves what GuardRails recorded. The decision remains
            bound to {receipt.extensionId}@{receipt.version}.
          </p>
        </div>
        <dl>
          <div>
            <dt>Extension</dt>
            <dd>{receipt.extensionId}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>
              <code>@{receipt.version}</code>
            </dd>
          </div>
          <div>
            <dt>Decision</dt>
            <dd>{humanize(receipt.decision)}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{new Date(receipt.recordedAt).toLocaleString()}</dd>
          </div>
          <div className={styles.receiptRationale}>
            <dt>Rationale</dt>
            <dd>{receipt.rationale}</dd>
          </div>
        </dl>
        <div className={styles.receiptIds}>
          <span>
            Decision ID <code>{receipt.decisionId}</code>
          </span>
          <span>
            Audit event <code>{receipt.eventId}</code>
          </span>
        </div>
      </div>
      <footer className={styles.receiptFooter}>
        <Link href="/workspace">Return to inbox</Link>
      </footer>
    </>
  );
}
function ExtensionsView({
  watches,
  badges,
  health,
  onRefresh,
}: {
  watches: WatchItem[];
  badges: BadgeItem[];
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
  const badgeByExtension = new Map(
    badges.map((badge) => [badge.extension_id.toLowerCase(), badge]),
  );
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
          <span>Badge</span>
          <span>Last event</span>
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
            <small>
              {badgeByExtension.has(item.extension_id.toLowerCase())
                ? `Badge · ${humanize(badgeByExtension.get(item.extension_id.toLowerCase())?.status || "ready")}`
                : "No badge yet"}
            </small>
            <time>
              {formatWorkspaceTime(item.last_event_at || item.created_at)}
            </time>
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
function DecisionsView({ decisions }: { decisions: QueueDecision[] }) {
  const groups = groupDecisionQueue(decisions);
  return (
    <>
      <PageTitle
        eyebrow="Decision history"
        title="Every call, accountable."
        copy="Ownership, rationale, and exact artifact identity stay attached to each decision."
      />
      <section className={styles.decisionGrid}>
        {[
          ["Due soon", groups.dueSoon],
          ["Open", groups.open],
          ["Resolved", groups.resolved],
        ].map(([label, items]) => (
          <div key={label as string}>
            <header>
              <span>{label as string}</span>
              <em>{(items as QueueDecision[]).length}</em>
            </header>
            {(items as QueueDecision[]).map((item) => (
              <article key={item.id}>
                <span className={styles.extensionAvatar}>
                  {initials(item.extension_id)}
                </span>
                <div>
                  <strong>{item.extension_id}</strong>
                  <code>@{item.version}</code>
                </div>
                <em>{humanize(item.decision)}</em>
              </article>
            ))}
            {!(items as QueueDecision[]).length ? (
              <p>No decisions here.</p>
            ) : null}
          </div>
        ))}
      </section>
    </>
  );
}
function ActivityView({
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
                <small>{badgeActivity(event.resulting_state)}</small>
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
function SettingsView({
  team,
  members,
  currentUserId,
  onMutateMember,
  onCreateInvite,
  notificationSettings,
  getAuthHeaders,
}: {
  team: Team;
  members: Member[];
  currentUserId: string;
  onMutateMember: (
    memberId: string,
    role: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreateInvite: (
    role: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  notificationSettings: React.ReactNode;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [section, setSection] = useState<
    "general" | "members" | "notifications"
  >("general");
  const [pending, setPending] = useState<{
    kind: "role" | "remove";
    member: Member;
    role?: string;
  } | null>(null);
  const [mutationState, setMutationState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [mutationMessage, setMutationMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviteState, setInviteState] = useState<
    "idle" | "saving" | "ready" | "error"
  >("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const canManage = team.role === "owner" || team.role === "admin";
  const roles = [
    {
      id: "owner",
      name: "Owner",
      copy: "Controls membership, integrations, and every workspace decision.",
    },
    {
      id: "admin",
      name: "Administrator",
      copy: "Manages people, delivery, monitoring, and review workflows.",
    },
    {
      id: "analyst",
      name: "Security analyst",
      copy: "Monitors extensions and records evidence-backed decisions.",
    },
    {
      id: "viewer",
      name: "Viewer",
      copy: "Reads reports, decisions, and activity without changing them.",
    },
  ];

  function canEdit(member: Member) {
    if (!canManage) return false;
    if (team.role === "owner") return true;
    return member.role === "analyst" || member.role === "viewer";
  }

  async function confirmMutation() {
    if (!pending) return;
    setMutationState("saving");
    setMutationMessage("");
    const result = await onMutateMember(
      pending.member.user_id,
      pending.kind === "role" ? pending.role || null : null,
    );
    if (result.ok) {
      setMutationState("saved");
      setMutationMessage(
        pending.kind === "role"
          ? `${memberName(pending.member)} is now ${roleName(pending.role || "viewer")}.`
          : `${memberName(pending.member)} was removed from the workspace.`,
      );
      setPending(null);
      window.setTimeout(() => setMutationState("idle"), 3500);
    } else {
      setMutationState("error");
      setMutationMessage(result.error);
    }
  }

  async function createInvite() {
    setInviteState("saving");
    setInviteMessage("");
    const result = await onCreateInvite(inviteRole);
    if (result.ok) {
      setInviteState("ready");
      setInviteMessage(result.url);
    } else {
      setInviteState("error");
      setInviteMessage(result.error);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Workspace settings"
        title={`Manage ${team.name}.`}
        copy="Membership, delivery, and security controls for this workspace."
      />
      <div className={styles.settingsLayout}>
        <nav aria-label="Workspace settings">
          <button
            className={section === "general" ? styles.settingsActive : ""}
            onClick={() => setSection("general")}
          >
            General
          </button>
          <button
            className={section === "members" ? styles.settingsActive : ""}
            onClick={() => setSection("members")}
          >
            Members & roles
          </button>
          <button
            className={section === "notifications" ? styles.settingsActive : ""}
            onClick={() => setSection("notifications")}
          >
            Notifications
          </button>
        </nav>
        <section>
          {section === "general" ? (
            <>
              <div className={styles.settingBlock}>
                <span>Workspace</span>
                <h2>General information</h2>
                <label>
                  Workspace name
                  <input value={team.name} readOnly />
                </label>
                <label>
                  Your role
                  <input value={roleName(team.role)} readOnly />
                </label>
              </div>
              <BillingPanel teamId={team.id} getAuthHeaders={getAuthHeaders} />
              <div className={styles.settingBlock}>
                <span>Access model</span>
                <h2>Who can change a release decision</h2>
                <div className={styles.roleGuide}>
                  {roles.map((role) => (
                    <article key={role.id}>
                      <UserCog />
                      <div>
                        <strong>{role.name}</strong>
                        <p>{role.copy}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : section === "members" ? (
            <>
              <div className={styles.memberHeader}>
                <div>
                  <span>People and access</span>
                  <h2>
                    {members.length} workspace member
                    {members.length === 1 ? "" : "s"}
                  </h2>
                  <p>
                    Role changes take effect immediately after confirmation and
                    are enforced by the workspace API.
                  </p>
                </div>
                {canManage ? (
                  <button
                    className={styles.inviteMemberButton}
                    onClick={() => {
                      setInviteOpen((value) => !value);
                      setInviteState("idle");
                      setInviteMessage("");
                    }}
                  >
                    <Plus /> Invite member
                  </button>
                ) : null}
              </div>
              {inviteOpen ? (
                <div className={styles.inviteMemberPanel}>
                  <div>
                    <span>Seven-day invitation</span>
                    <strong>Choose the access new members receive.</strong>
                    <p>
                      Owner access is never granted through an invitation. An
                      existing owner can promote the member later.
                    </p>
                  </div>
                  <label>
                    Starting role
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                    >
                      <option value="admin">Administrator</option>
                      <option value="analyst">Security analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <button
                    onClick={() => void createInvite()}
                    disabled={inviteState === "saving"}
                  >
                    {inviteState === "saving"
                      ? "Creating link…"
                      : "Create invitation link"}
                  </button>
                  {inviteState === "ready" ? (
                    <div className={styles.inviteResult} role="status">
                      <input
                        aria-label="Invitation link"
                        value={inviteMessage}
                        readOnly
                      />
                      <button
                        onClick={() =>
                          void navigator.clipboard.writeText(inviteMessage)
                        }
                      >
                        <ClipboardCheck /> Copy link
                      </button>
                    </div>
                  ) : null}
                  {inviteState === "error" ? (
                    <div className={styles.inviteError} role="alert">
                      <CircleAlert />
                      <span>{inviteMessage}</span>
                      <button onClick={() => void createInvite()}>
                        <RotateCcw /> Retry
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!canManage ? (
                <div className={styles.memberNotice}>
                  <ShieldCheck />
                  <span>
                    <strong>Read-only membership directory</strong>Only owners
                    and administrators can change workspace access.
                  </span>
                </div>
              ) : null}
              {mutationState === "saved" ? (
                <div className={styles.memberSuccess} role="status">
                  <CheckCircle2 />
                  {mutationMessage}
                </div>
              ) : null}
              {mutationState === "error" ? (
                <div className={styles.memberError} role="alert">
                  <CircleAlert />
                  <span>
                    <strong>Membership unchanged</strong>
                    {mutationMessage}
                  </span>
                  <button
                    onClick={() => void confirmMutation()}
                    disabled={!pending}
                  >
                    <RotateCcw /> Retry
                  </button>
                </div>
              ) : null}
              <div className={styles.memberTable}>
                <header>
                  <span>Member</span>
                  <span>Workspace role</span>
                  <span>Access</span>
                </header>
                {members.map((member) => {
                  const finalOwner =
                    member.role === "owner" && ownerCount === 1;
                  const editable = canEdit(member) && !finalOwner;
                  const choices =
                    team.role === "owner"
                      ? roles
                      : roles.filter(
                          (role) =>
                            role.id === "analyst" || role.id === "viewer",
                        );
                  return (
                    <article key={member.user_id}>
                      <span className={styles.memberAvatar}>
                        {initials(memberName(member))}
                      </span>
                      <div>
                        <strong>
                          {memberName(member)}{" "}
                          {member.user_id === currentUserId ? (
                            <em>You</em>
                          ) : null}
                        </strong>
                        <small>{member.user_id}</small>
                      </div>
                      <label>
                        <span className={styles.srOnly}>
                          Role for {memberName(member)}
                        </span>
                        <select
                          value={member.role}
                          disabled={!editable}
                          onChange={(event) =>
                            setPending({
                              kind: "role",
                              member,
                              role: event.target.value,
                            })
                          }
                        >
                          {choices.some(
                            (role) => role.id === member.role,
                          ) ? null : (
                            <option value={member.role}>
                              {roleName(member.role)}
                            </option>
                          )}
                          {choices.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.memberAccess}>
                        <span>
                          {finalOwner
                            ? "Final owner protected"
                            : editable
                              ? "Can be changed"
                              : "Protected by your role"}
                        </span>
                        {editable ? (
                          <button
                            aria-label={`Remove ${memberName(member)}`}
                            onClick={() =>
                              setPending({ kind: "remove", member })
                            }
                          >
                            <Trash2 />
                          </button>
                        ) : (
                          <ShieldCheck />
                        )}
                      </div>
                    </article>
                  );
                })}
                {!members.length ? <p>Member directory is empty.</p> : null}
              </div>
            </>
          ) : (
            notificationSettings
          )}
        </section>
      </div>
      {pending ? (
        <div
          className={styles.memberConfirmOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              mutationState !== "saving"
            )
              setPending(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-confirm-title"
          >
            <span>
              <UserCog />
            </span>
            <h2 id="member-confirm-title">
              {pending.kind === "role"
                ? "Confirm role change"
                : pending.member.user_id === currentUserId
                  ? "Leave this workspace?"
                  : "Remove workspace access?"}
            </h2>
            <p>
              {pending.kind === "role"
                ? `${memberName(pending.member)} will become ${roleName(pending.role || "viewer")}. Their available actions change immediately.`
                : `${memberName(pending.member)} will lose access to this workspace, its reports, decisions, and monitoring activity.`}
            </p>
            {pending.member.role === "owner" ? (
              <div className={styles.ownerWarning}>
                <CircleAlert />
                Owner changes can affect administration and recovery. GuardRails
                will never allow the final owner to be removed or demoted.
              </div>
            ) : null}
            <footer>
              <button
                onClick={() => {
                  setPending(null);
                  setMutationState("idle");
                }}
                disabled={mutationState === "saving"}
              >
                Cancel
              </button>
              <button
                className={
                  pending.kind === "remove"
                    ? styles.dangerAction
                    : styles.confirmAction
                }
                onClick={() => void confirmMutation()}
                disabled={mutationState === "saving"}
              >
                {mutationState === "saving"
                  ? "Applying change…"
                  : pending.kind === "role"
                    ? "Confirm role change"
                    : "Remove access"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatWorkspaceTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
function initials(value: string) {
  return (
    value
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GR"
  );
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function roleName(role: string) {
  return role === "owner"
    ? "Workspace owner"
    : role === "admin"
      ? "Administrator"
      : role === "analyst"
        ? "Security analyst"
        : "Viewer";
}
function memberName(member: Member) {
  const profile = Array.isArray(member.profiles)
    ? member.profiles[0]
    : member.profiles;
  return profile?.display_name || "Team member";
}
function memberLabel(members: Member[], id: string) {
  return memberName(
    members.find((member) => member.user_id === id) || {
      user_id: id,
      role: "viewer",
    },
  );
}

function decisionScan(decision: QueueDecision): Record<string, unknown> | null {
  if (Array.isArray(decision.scans)) return decision.scans[0] || null;
  return decision.scans && typeof decision.scans === "object"
    ? decision.scans
    : null;
}
function watchName(item: WatchItem) {
  const data = Array.isArray(item.extensions)
    ? item.extensions[0]
    : item.extensions;
  return data?.display_name || item.extension_id;
}
