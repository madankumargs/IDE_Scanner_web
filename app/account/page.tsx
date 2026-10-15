"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  AtSign,
  Check,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";
import { normalizeEmail } from "@/lib/emailOtp";
import { trackProductEvent } from "@/lib/analyticsEvents";
import ExtensionSearch from "@/app/ExtensionSearch";
import type { DiscoveryResult } from "@/lib/types";
import styles from "./Onboarding.module.css";
import "./account.css";

type AccountState = {
  email: string;
  provider: "cloudflare" | "supabase";
  profile: Record<string, unknown> | null;
};
// Google and email have Cloudflare/D1 implementations in production. Keep
// the buttons visible even when the legacy Supabase browser client is absent.
const googleEnabled = true;
// GitHub OAuth is handled by the Cloudflare Worker and does not depend on the
// Supabase project. Keep the Supabase flags for local compatibility, but always
// expose the working Cloudflare path in production.
const githubEnabled = true;

function extensionFromDestination(destination: string) {
  try {
    const target = new URL(destination, "https://guardrails.local");
    const fromQuery = target.searchParams.get("extension");
    if (fromQuery) return fromQuery;
    const match = target.pathname.match(/^\/extensions\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function safeDestination(destination: string | null | undefined) {
  return destination?.startsWith("/") && !destination.startsWith("//")
    ? destination
    : "/workspace";
}

export default function AccountPage() {
  const router = useRouter();
  const db = useMemo(() => browserDb(), []);
  const [email, setEmail] = useState("");
  const [emailAuthPending, setEmailAuthPending] = useState(false);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    const error = new URLSearchParams(window.location.search).get("error");
    return error === "invalid_link"
      ? "That sign-in link is invalid or expired. Start a new sign-in."
      : error === "missing_code"
        ? "The sign-in response was incomplete. Start again."
        : error === "invalid_state"
          ? "That sign-in session expired. Start again."
          : error === "provider_denied"
          ? "Google could not complete sign-in. Check the OAuth callback settings, then try again or use the email link."
          : error === "google_unconfigured"
            ? "Google sign-in is not configured on this deployment yet. Add the server-only Google OAuth client secret, then try again or use GitHub."
            : error === "google_denied"
              ? "Google declined this sign-in. If this is a testing OAuth app, add your Google account as a test user."
            : error === "missing_email"
              ? "The provider did not return a verified email address. Try another option."
              : error === "provider_unavailable"
                ? "That sign-in provider is temporarily unavailable. Try again shortly."
        : "";
  });
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedExtension, setSelectedExtension] =
    useState<DiscoveryResult | null>(null);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const destination =
    typeof window === "undefined"
      ? "/workspace"
      : new URLSearchParams(window.location.search).get("next") || "/workspace";
  const sourceExtension = extensionFromDestination(destination);
  const entryPoint = destination.startsWith("/monitor")
    ? "monitor"
    : destination.startsWith("/extensions/")
      ? "report"
      : ("account" as const);
  const resumeLabel =
    entryPoint === "monitor"
      ? "Continue to monitor this extension."
      : entryPoint === "report"
        ? "Try five free scans before setting up a workspace."
        : "Continue to your workspace.";
  useEffect(() => {
    void (async () => {
      try {
        const cloudflare = await fetch("/api/auth/session", { cache: "no-store" });
        const cloudflareBody = await cloudflare.json().catch(() => ({}));
        if (cloudflare.ok && cloudflareBody.user) {
          setAccount({
            email: String(cloudflareBody.user.email || ""),
            provider: String(cloudflareBody.user.provider || "").toLowerCase() === "supabase" ? "supabase" : "cloudflare",
            profile: cloudflareBody.profile || null,
          });
          setLoading(false);
          return;
        }
        if (!db) {
          setLoading(false);
          return;
        }
        const headers = await browserAuthHeaders(db);
        if (!headers.Authorization) {
          setLoading(false);
          return;
        }
        const { data } = await db.auth.getUser();
        const user = data.user;
        if (!user) {
          setLoading(false);
          return;
        }
        const response = await fetch("/api/profile", {
          headers,
        });
        const body = await response.json();
        setAccount({ email: user.email || "", provider: "supabase", profile: body.profile || null });
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [db]);
  useEffect(() => {
    // Clear the error from the URL so a reload or later navigation starts clean.
    const clean = new URL(window.location.href);
    if (!clean.searchParams.has("error")) return;
    clean.searchParams.delete("error");
    window.history.replaceState(null, "", clean);
  }, []);
  async function oauth(provider: "google" | "github") {
    trackProductEvent({
      name: "workspace_signup_started",
      source_route: window.location.pathname,
      entry_point: entryPoint,
    });
    const next = new URLSearchParams(window.location.search).get("next") || "/workspace";
    const route = provider === "google" ? "/api/auth/google" : "/api/auth/github";
    window.location.assign(new URL(`${route}?next=${encodeURIComponent(next)}`, window.location.origin).toString());
  }
  async function sendEmailLink() {
    const address = normalizeEmail(email);
    if (!address) return setMessage("Enter an email address.");
    trackProductEvent({
      name: "workspace_signup_started",
      source_route: window.location.pathname,
      entry_point: entryPoint,
    });
    setEmailAuthPending(true);
    try {
      const next = new URLSearchParams(window.location.search).get("next") || "/workspace";
      const response = await fetch(`/api/auth/email/request?next=${encodeURIComponent(next)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error || "Email sign-in is temporarily unavailable.");
      setEmail(address);
      setMessage(body.message || "Check your email for a secure sign-in link.");
    } catch {
      setMessage("Email sign-in is temporarily unavailable. Try Google or GitHub.");
    } finally {
      setEmailAuthPending(false);
    }
  }
  async function finishOnboarding() {
    if (!account || onboardingSaving) return;
    const name = workspaceName.trim() || "My developer workspace";
    setOnboardingSaving(true);
    setMessage("");
    try {
      const headers = await browserAuthHeaders(db);
      if (!headers.Authorization) throw new Error("Your session expired. Sign in again.");
      const teamsResponse = await fetch("/api/teams", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, onboarding: true }),
      });
      const teamsBody = await teamsResponse.json().catch(() => ({}));
      if (!teamsResponse.ok) {
        setOnboardingSaving(false);
        return setMessage(
          teamsBody.error || "Your workspace could not be created. Try again.",
        );
      }
      const profileResponse = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const profileBody = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) {
        setOnboardingSaving(false);
        return setMessage(
          profileBody.error ||
            "Your workspace was created, but setup is not complete. Try again to save your profile.",
        );
      }
      if (!teamsBody.reused) {
        trackProductEvent({
          name: "workspace_created",
          source_route: window.location.pathname,
        });
      }

      let monitored = false;
      if (selectedExtension) {
        const watchResponse = await fetch(
          `/api/teams/${encodeURIComponent(String(teamsBody.id))}/watchlist`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              extension_id: selectedExtension.extension_id,
              version: selectedExtension.version,
              registry: selectedExtension.registry || "vs-marketplace",
            }),
          },
        );
        const watchBody = await watchResponse.json().catch(() => ({}));
        monitored =
          watchResponse.ok && watchBody.monitoring_state === "monitoring";
        if (watchResponse.ok) {
          trackProductEvent({
            name: "watch_created",
            source_route: window.location.pathname,
            scope: "team",
          });
        }
      }

      setAccount({ ...account, profile: profileBody.profile });
      if (monitored) {
        router.push(safeDestination(destination));
        return;
      }
      const params = new URLSearchParams();
      params.set("setup", String(teamsBody.id));
      const extension = selectedExtension?.extension_id || sourceExtension;
      if (extension) params.set("extension", extension);
      router.push(`/workspace?${params.toString()}`);
    } catch {
      setOnboardingSaving(false);
      setMessage("Setup could not be completed. Try again.");
    }
  }
  async function signOut() {
    if (account?.provider === "supabase") await db?.auth.signOut();
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null);
  }
  if (loading)
    return (
      <main className="authProductPage accountModern">
        <div className="authLoading">
          <LoaderCircle className="spin" /> Opening secure session…
        </div>
      </main>
    );
  if (account && !account.profile?.onboarding_completed)
    return (
      <main className={styles.page}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>Your first monitored extension</span>
          <h1>Start with the extension you want to keep under review.</h1>
          <p>
            GuardRails creates a workspace around a real decision: the exact
            extension release you want to monitor. Invite reviewers and connect
            delivery channels later, when they are useful. Your free plan starts
            immediately with no payment details.
          </p>
          <p>Five Deep Scans are free. No card is required.</p>
          <ul className={styles.benefits}>
            <li>Your reviewed version becomes a clear monitoring baseline</li>
            <li>
              New releases return with an exact before-and-after comparison
            </li>
            <li>Every decision keeps its evidence, owner, and reason</li>
            <li>Workspace controls stay optional until your first watch is live</li>
          </ul>
        </section>
        <section className={styles.form} aria-label="Workspace setup">
          <div className={styles.formIntro}>
            <span className={styles.formEyebrow}>One useful step</span>
            <h2>Choose an extension to monitor</h2>
            <p>
              Select the exact release to start from. This does not upload your
              source code.
            </p>
          </div>
          <ExtensionSearch
            initialQuery={sourceExtension}
            onSelect={setSelectedExtension}
            submitLabel="Find extension"
          />
          {selectedExtension ? (
            <p className={styles.message}>
              Monitoring starts with <strong>{selectedExtension.display_name}</strong>{" "}
              <code>@{selectedExtension.version}</code>.
            </p>
          ) : null}
          <label className={styles.workspaceName}>
            <span>Workspace name (optional)</span>
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              maxLength={80}
              placeholder="My developer workspace"
            />
          </label>
          <button
            className={styles.primaryAction}
            onClick={() => void finishOnboarding()}
            disabled={onboardingSaving}
          >
            {onboardingSaving ? (
              <>
                <LoaderCircle className="spin" /> Creating workspace
              </>
            ) : (
              <>
                {selectedExtension ? "Start monitoring" : "Create workspace"} <ArrowRight />
              </>
            )}
          </button>
          {message ? <p className={styles.message}>{message}</p> : null}
        </section>
      </main>
    );
  if (account)
    return (
      <main className="authProductPage accountModern">
        <section className="signedInProduct">
          <div>
            <span>
              <ShieldCheck /> Signed in
            </span>
            <h1>Your GuardRails workspace.</h1>
            <p>{account.email}</p>
          </div>
          <button className="button buttonQuiet" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </button>
        </section>
        <section className="accountNextSteps">
          <Link href="/workspace">
            <RadarIcon />
            <div>
              <span>Monitor</span>
              <strong>Open watchlists and release changes</strong>
              <p>Return to decisions that need attention.</p>
            </div>
            <ArrowRight />
          </Link>
          <Link href="/registry">
            <ShieldCheck />
            <div>
              <span>Extension Registry</span>
              <strong>Find an extension to monitor</strong>
              <p>Search public extension profiles and their versions.</p>
            </div>
            <ArrowRight />
          </Link>
        </section>
      </main>
    );
  return (
    <main className="authProductPage accountModern">
      <section className="authValue">
        <div>
          <span>Extension decisions that stay useful</span>
          <h1>Know what changed. Keep the decision.</h1>
          <p>
            Review an exact extension release, keep its evidence attached, and
            return only when a meaningful update needs your attention.
          </p>
          <ul>
            <li>
              <Check /> Five Deep Scans free — no card required
            </li>
            <li>
              <Check /> Public catalog and exact-version intelligence
            </li>
            <li>
              <Check /> Personal extension watchlist
            </li>
            <li>
              <Check /> Version-change monitoring
            </li>
            <li>
              <Check /> Five free Deep Scans before workspace setup
            </li>
            <li>
              <Check /> Personal review history
            </li>
          </ul>
        </div>
        <aside>
          <LockKeyhole />
          <strong>Your source code is not part of sign-in.</strong>
          <p>
            Authentication protects your personal workspace. Public extension
            analysis remains public.
          </p>
        </aside>
      </section>
      <section className="oauthPanel">
        <div>
          <span>Continue to GuardRails</span>
          <h2>{resumeLabel}</h2>
        </div>
        {googleEnabled ? (
          <button
            className="oauthButton google"
            onClick={() => void oauth("google")}
          >
            <GoogleMark /> Continue with Google <ArrowRight />
          </button>
        ) : null}
        {githubEnabled ? (
          <button className="oauthButton" onClick={() => void oauth("github")}>
            <GitHubMark /> Continue with GitHub <ArrowRight />
          </button>
        ) : null}
        {googleEnabled || githubEnabled ? (
          <div className="authDivider">
            <span>or use email</span>
          </div>
        ) : null}
        <form
          className="emailOtp"
          onSubmit={(event) => {
            event.preventDefault();
            void sendEmailLink();
          }}
        >
          <label>
            <AtSign />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-label="Email address"
              autoComplete="email"
              spellCheck={false}
              disabled={emailAuthPending}
              required
            />
          </label>
          <button type="submit" disabled={emailAuthPending}>
            {emailAuthPending ? "Sending…" : "Email me a secure link"}
          </button>
        </form>
        {message ? (
          <p className="authMessage" role="status">
            {message}
          </p>
        ) : null}
        <small>
          By continuing, you agree to use the service responsibly. Public
          extension intelligence remains available without an account.
        </small>
      </section>
    </main>
  );
}
function GoogleMark() {
  return (
    <svg className="googleMark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.51h3.23c1.89-1.74 2.82-4.3 2.82-7.28Z"
      />
      <path
        fill="#34A853"
        d="M12 21.75c2.63 0 4.84-.87 6.45-2.36L15.22 16.9c-.87.58-1.98.92-3.22.92-2.55 0-4.71-1.72-5.48-4.03H3.18v2.59A9.75 9.75 0 0 0 12 21.75Z"
      />
      <path
        fill="#FBBC05"
        d="M6.52 13.79A5.87 5.87 0 0 1 6.21 12c0-.62.11-1.23.31-1.79V7.62H3.18A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05.93 4.38l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.18c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.27 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.82 5.37l3.34 2.59C7.29 7.9 9.45 6.18 12 6.18Z"
      />
    </svg>
  );
}
function GitHubMark() {
  return (
    <svg className="githubMark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .5C5.73.5.5 5.73.5 12c0 5.02 3.44 9.27 8.21 10.78.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.21.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.92 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.76c1.02 0 2.05.14 3.01.41 2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.6-2.8 5.61-5.47 5.91.43.37.81 1.09.81 2.2v3.27c0 .32.22.69.83.57A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"
      />
    </svg>
  );
}
function RadarIcon() {
  return (
    <div className="radarIcon">
      <i />
      <span />
    </div>
  );
}
