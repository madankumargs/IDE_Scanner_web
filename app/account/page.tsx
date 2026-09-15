"use client";
import { useEffect, useMemo, useState } from "react";
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
import { authErrorMessage } from "@/lib/authError";
import { isEmailOtp, normalizeEmail, normalizeEmailOtp } from "@/lib/emailOtp";
import { trackProductEvent } from "@/lib/analyticsEvents";
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
export default function AccountPage() {
  const db = useMemo(() => browserDb(), []);
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
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
            ? "The sign-in provider declined the request. Try again or use another option."
            : error === "missing_email"
              ? "The provider did not return a verified email address. Try another option."
              : error === "provider_unavailable"
                ? "That sign-in provider is temporarily unavailable. Try again shortly."
        : "";
  });
  const [role, setRole] = useState("developer");
  const [ide, setIde] = useState("vscode");
  const [useCase, setUseCase] = useState("personal");
  const [workspaceName, setWorkspaceName] = useState("");
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const destination =
    typeof window === "undefined"
      ? "/workspace"
      : new URLSearchParams(window.location.search).get("next") || "/workspace";
  const entryPoint = destination.startsWith("/monitor")
    ? "monitor"
    : destination.startsWith("/extensions/")
      ? "report"
      : ("account" as const);
  const resumeLabel =
    entryPoint === "monitor"
      ? "Continue to monitor this extension."
      : entryPoint === "report"
        ? "Continue with this exact public report."
        : "Continue to your workspace.";
  useEffect(() => {
    void (async () => {
      try {
        const cloudflare = await fetch("/api/auth/session", { cache: "no-store" });
        const cloudflareBody = await cloudflare.json().catch(() => ({}));
        if (cloudflare.ok && cloudflareBody.user) {
          setAccount({
            email: String(cloudflareBody.user.email || ""),
            provider: "cloudflare",
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
  function callbackUrl() {
    const destination =
      new URLSearchParams(window.location.search).get("next") || "/workspace";
    // The PKCE code verifier lives in a cookie on this origin, so the email
    // link must come back to the same origin or the exchange fails.
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
  }
  function continueToDestination() {
    const destination = new URLSearchParams(window.location.search).get("next");
    window.location.assign(
      destination?.startsWith("/") && !destination.startsWith("//")
        ? destination
        : "/workspace",
    );
  }
  async function oauth(provider: "google" | "github") {
    if (provider === "github") {
      const next = new URLSearchParams(window.location.search).get("next") || "/workspace";
      window.location.assign(`/api/auth/github?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!db) {
      const next = new URLSearchParams(window.location.search).get("next") || "/workspace";
      window.location.assign(`/api/auth/google?next=${encodeURIComponent(next)}`);
      return;
    }
    trackProductEvent({
      name: "workspace_signup_started",
      source_route: window.location.pathname,
      entry_point: entryPoint,
    });
    const result = await db.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (result.error) setMessage(result.error.message);
  }
  async function sendEmailOtp() {
    const address = normalizeEmail(email);
    if (!address) return setMessage("Enter an email address.");
    trackProductEvent({
      name: "workspace_signup_started",
      source_route: window.location.pathname,
      entry_point: entryPoint,
    });
    setEmailAuthPending(true);
    if (!db) {
      try {
        const response = await fetch("/api/auth/email/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address }),
        });
        const body = await response.json().catch(() => ({}));
        setEmailAuthPending(false);
        if (!response.ok) return setMessage(body.error || "Email sign-in is temporarily unavailable.");
        setEmail(address);
        setEmailOtp("");
        setEmailOtpSent(true);
        return setMessage(body.message || "Enter the sign-in code we sent to your email.");
      } catch {
        setEmailAuthPending(false);
        return setMessage("Email sign-in is temporarily unavailable. Try Google or GitHub.");
      }
    }
    const result = await db.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: callbackUrl() },
    });
    setEmailAuthPending(false);
    if (result.error) return setMessage(authErrorMessage(result.error));
    setEmail(address);
    setEmailOtp("");
    setEmailOtpSent(true);
    setMessage("Enter the sign-in code we sent to your email.");
  }
  async function verifyEmailOtp() {
    const address = normalizeEmail(email);
    if (!isEmailOtp(emailOtp))
      return setMessage("Enter the complete sign-in code.");
    setEmailAuthPending(true);
    if (!db) {
      try {
        const response = await fetch("/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: address,
            code: emailOtp,
            next: new URLSearchParams(window.location.search).get("next") || "/workspace",
          }),
        });
        const body = await response.json().catch(() => ({}));
        setEmailAuthPending(false);
        if (!response.ok) return setMessage(body.error || "That code is invalid or expired.");
        window.location.assign(body.next || "/workspace");
        return;
      } catch {
        setEmailAuthPending(false);
        return setMessage("Email sign-in is temporarily unavailable. Try again.");
      }
    }
    const result = await db.auth.verifyOtp({
      email: address,
      token: emailOtp,
      type: "email",
    });
    setEmailAuthPending(false);
    if (result.error)
      return setMessage("That code is invalid or expired. Request a new one.");
    continueToDestination();
  }
  async function finishOnboarding() {
    if (!account || onboardingSaving) return;
    const name =
      workspaceName.trim() ||
      (useCase === "team" ? "My team workspace" : "My developer workspace");
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
        body: JSON.stringify({ role, primary_ide: ide, use_case: useCase }),
      });
      const profileBody = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) {
        setOnboardingSaving(false);
        return setMessage(
          profileBody.error ||
            "Your workspace was created, but setup is not complete. Try again to save your profile.",
        );
      }
      setAccount({ ...account, profile: profileBody.profile });
      continueToDestination();
    } catch {
      setOnboardingSaving(false);
      setMessage("Setup could not be completed. Try again.");
    }
  }
  async function signOut() {
    if (account?.provider === "supabase") await db?.auth.signOut();
    else await fetch("/api/auth/logout", { method: "POST" });
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
          <span className={styles.eyebrow}>Your first baseline</span>
          <h1>Set up the place where extension changes come back to you.</h1>
          <p>
            In under a minute, create a workspace, choose the tools you use, and
            make your first extension decision traceable. You can invite
            teammates after setup.
          </p>
          <ul className={styles.benefits}>
            <li>Your reviewed version becomes a clear monitoring baseline</li>
            <li>
              New releases return with an exact before-and-after comparison
            </li>
            <li>Every decision keeps its evidence, owner, and reason</li>
          </ul>
        </section>
        <section className={styles.form} aria-label="Workspace setup">
          <div className={styles.formIntro}>
            <span className={styles.formEyebrow}>Step 1 of 1</span>
            <h2>Create your decision space</h2>
            <p>
              Start alone or invite a team later. This does not upload any
              source code.
            </p>
          </div>
          <label className={styles.workspaceName}>
            <span>Workspace name</span>
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              maxLength={80}
              placeholder={
                useCase === "team"
                  ? "Acme engineering"
                  : "My developer workspace"
              }
            />
          </label>
          <Choice
            label="Who is this for?"
            value={useCase}
            setValue={setUseCase}
            options={[
              ["personal", "Just me"],
              ["team", "My team"],
            ]}
          />
          <Choice
            label="Your role"
            value={role}
            setValue={setRole}
            options={[
              ["developer", "Developer"],
              ["security", "Security engineer"],
              ["engineering_leader", "Engineering leader"],
            ]}
          />
          <Choice
            label="Primary IDE"
            value={ide}
            setValue={setIde}
            options={[
              ["vscode", "VS Code"],
              ["cursor", "Cursor"],
              ["windsurf", "Windsurf"],
              ["vscodium", "VSCodium"],
              ["other", "Other"],
            ]}
          />
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
                Create workspace <ArrowRight />
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
              <Check /> Public catalog and exact-version intelligence
            </li>
            <li>
              <Check /> Personal extension watchlist
            </li>
            <li>
              <Check /> Version-change monitoring
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
            void (emailOtpSent ? verifyEmailOtp() : sendEmailOtp());
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
              disabled={emailAuthPending || emailOtpSent}
              required
            />
          </label>
          {emailOtpSent ? (
            <>
              <input
                className="emailOtpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6,10}"
                value={emailOtp}
                onChange={(event) =>
                  setEmailOtp(normalizeEmailOtp(event.target.value))
                }
                placeholder="Sign-in code"
                aria-label="Sign-in code"
                autoComplete="one-time-code"
                maxLength={10}
                required
              />
              <div className="emailOtpActions">
                <button type="submit" disabled={emailAuthPending}>
                  {emailAuthPending ? "Verifying…" : "Verify code"}
                </button>
                <button
                  type="button"
                  className="textAction"
                  onClick={() => void sendEmailOtp()}
                  disabled={emailAuthPending}
                >
                  Send a new code
                </button>
              </div>
            </>
          ) : (
            <button type="submit" disabled={emailAuthPending}>
              {emailAuthPending ? "Sending…" : "Email me a code"}
            </button>
          )}
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
function Choice({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[][];
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>{label}</legend>
      <div className={styles.choiceOptions}>
        {options.map(([id, text]) => (
          <button
            type="button"
            className={styles.choiceButton}
            aria-pressed={value === id}
            key={id}
            onClick={() => setValue(id)}
          >
            {value === id ? <Check /> : null}
            {text}
          </button>
        ))}
      </div>
    </fieldset>
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
