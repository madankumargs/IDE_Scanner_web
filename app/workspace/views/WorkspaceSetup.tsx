"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleAlert,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import BrandMark from "@/app/BrandMark";
import ExtensionSearch from "@/app/ExtensionSearch";
import type { DiscoveryResult } from "@/lib/types";
import type { Team } from "@/app/workspace/types";
import { initials } from "@/app/workspace/format";
import styles from "@/app/workspace/teamWorkspace.module.css";

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
      <CircleAlert /> {error}
    </p>
  ) : null;
}

export default function WorkspaceSetup({
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
