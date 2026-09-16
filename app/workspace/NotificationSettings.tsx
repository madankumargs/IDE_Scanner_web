"use client";

import { FormEvent, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import styles from "./notificationSettings.module.css";

export type NotificationChannel = {
  id: string;
  kind: string;
  label: string;
  enabled: boolean;
  minimum_severity: string;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
};
export type NotificationDelivery = {
  id: string;
  channel_id: string;
  status: string;
  attempts: number;
  delivered_at: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
};
export type EventPreference =
  | "release_alerts"
  | "scan_alerts"
  | "decision_alerts"
  | "high_evidence_alerts"
  | "provenance_alerts"
  | "coverage_alerts"
  | "due_alerts";
export type NotificationPreferences = Record<EventPreference, boolean> & {
  weekly_digest: boolean;
  digest_weekday: number;
  digest_hour_utc: number;
};
export type DigestDelivery = {
  id: string;
  channel_id: string;
  status: string;
  delivered_at: string | null;
  last_error: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
};
export type ChannelInput = {
  kind: string;
  label: string;
  minimum_severity: string;
  webhook_url?: string;
  email?: string;
  jira_site?: string;
  jira_email?: string;
  jira_api_token?: string;
  jira_project_key?: string;
};
type Result = { ok: true } | { ok: false; error: string };

const events: Array<[EventPreference, string, string]> = [
  [
    "release_alerts",
    "New extension releases",
    "Return when a watched extension publishes a new artifact.",
  ],
  [
    "scan_alerts",
    "Analysis completed or failed",
    "Know when per-version results is ready or needs attention.",
  ],
  [
    "decision_alerts",
    "Team decisions",
    "Share allow, block, exception, and ownership changes.",
  ],
  [
    "due_alerts",
    "Review deadlines",
    "Remind owners before and after a decision becomes overdue.",
  ],
  [
    "high_evidence_alerts",
    "High-confidence evidence",
    "Deliver important findings backed by strong artifact coverage.",
  ],
  [
    "provenance_alerts",
    "Provenance changes",
    "Notice publisher, source, and artifact-identity changes.",
  ],
  [
    "coverage_alerts",
    "Coverage changes",
    "Flag releases whose analysis coverage drops below expectations.",
  ],
];

export default function NotificationSettings({
  configured,
  channels,
  deliveries,
  digestDeliveries,
  preferences,
  digestPreview,
  canManage,
  onSavePreference,
  onCreateChannel,
  onDeleteChannel,
  onTestChannel,
}: {
  configured: boolean;
  channels: NotificationChannel[];
  deliveries: NotificationDelivery[];
  digestDeliveries: DigestDelivery[];
  preferences: NotificationPreferences;
  digestPreview: { monitored: number; changes: number; needsReview: number };
  canManage: boolean;
  onSavePreference: (
    field: keyof NotificationPreferences,
    value: boolean | number,
  ) => Promise<Result>;
  onCreateChannel: (input: ChannelInput) => Promise<Result>;
  onDeleteChannel: (id: string) => Promise<Result>;
  onTestChannel: (id: string) => Promise<Result>;
}) {
  const [tab, setTab] = useState<"events" | "delivery">("delivery");
  const [kind, setKind] = useState("slack_webhook");
  const [formState, setFormState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<
    Record<string, { tone: "success" | "error"; message: string }>
  >({});
  const [removeId, setRemoveId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormState("saving");
    setMessage("");
    const data = new FormData(form);
    const input: ChannelInput = {
      kind,
      label: String(data.get("label") || ""),
      minimum_severity: String(data.get("severity") || "MEDIUM"),
      webhook_url: String(data.get("webhook_url") || ""),
      email: String(data.get("email") || ""),
      jira_site: String(data.get("jira_site") || ""),
      jira_email: String(data.get("jira_email") || ""),
      jira_api_token: String(data.get("jira_api_token") || ""),
      jira_project_key: String(data.get("jira_project_key") || ""),
    };
    const response = await onCreateChannel(input);
    if (response.ok) {
      setFormState("idle");
      form.reset();
    } else {
      setFormState("error");
      setMessage(response.error);
    }
  }
  async function test(channel: NotificationChannel) {
    setBusy(`test:${channel.id}`);
    setResult((current) => {
      const next = { ...current };
      delete next[channel.id];
      return next;
    });
    const response = await onTestChannel(channel.id);
    setBusy("");
    setResult((current) => ({
      ...current,
      [channel.id]: response.ok
        ? {
            tone: "success",
            message: `Test delivered to ${provider(channel.kind)}.`,
          }
        : { tone: "error", message: response.error },
    }));
  }
  async function remove(channel: NotificationChannel) {
    setBusy(`remove:${channel.id}`);
    const response = await onDeleteChannel(channel.id);
    setBusy("");
    if (!response.ok)
      setResult((current) => ({
        ...current,
        [channel.id]: { tone: "error", message: response.error },
      }));
    else setRemoveId("");
  }
  async function savePreference(
    field: keyof NotificationPreferences,
    value: boolean | number,
  ) {
    setBusy(field);
    setResult((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    const response = await onSavePreference(field, value);
    setBusy("");
    if (!response.ok)
      setResult((current) => ({
        ...current,
        [field]: { tone: "error", message: response.error },
      }));
  }
  return (
    <div className={styles.settings}>
      <nav aria-label="Notification settings">
        <button
          className={tab === "delivery" ? styles.active : ""}
          onClick={() => setTab("delivery")}
        >
          Delivery channels <span>{channels.length}</span>
        </button>
        <button
          className={tab === "events" ? styles.active : ""}
          onClick={() => setTab("events")}
        >
          Events and thresholds
        </button>
      </nav>
      {tab === "delivery" ? (
        <>
          <section className={styles.hero}>
            <div>
              <span>Delivery health</span>
              <h2>Bring the right changes back to your team.</h2>
              <p>
                Connect one destination, verify it with a real test, and keep
                failures visible without exposing credentials.
              </p>
            </div>
            <div>
              <strong>
                {
                  channels.filter(
                    (channel) =>
                      channel.last_validated_at && !channel.last_error,
                  ).length
                }
              </strong>
              <small>healthy channels</small>
            </div>
          </section>
          {!configured ? (
            <div className={styles.operatorWarning}>
              <CircleAlert />
              <span>
                <strong>Outbound delivery is unavailable</strong>The service
                operator must configure encryption and notification scheduling
                before channels can be connected.
              </span>
            </div>
          ) : null}
          <section className={styles.channelGrid}>
            {channels.map((channel) => {
              const latest = deliveries.find(
                (delivery) => delivery.channel_id === channel.id,
              );
              const health = channel.last_error
                ? "error"
                : channel.last_validated_at
                  ? "healthy"
                  : "untested";
              return (
                <article key={channel.id}>
                  <header>
                    <span className={styles.providerIcon}>
                      {icon(channel.kind)}
                    </span>
                    <div>
                      <strong>{channel.label}</strong>
                      <small>
                        {provider(channel.kind)} · {channel.minimum_severity}{" "}
                        and above
                      </small>
                    </div>
                    <em className={styles[health]}>{health}</em>
                  </header>
                  <dl>
                    <div>
                      <dt>Last verified</dt>
                      <dd>{formatTime(channel.last_validated_at)}</dd>
                    </div>
                    <div>
                      <dt>Latest delivery</dt>
                      <dd>
                        {latest
                          ? `${humanize(latest.status)} · ${formatTime(latest.delivered_at || latest.created_at)}`
                          : "No delivery yet"}
                      </dd>
                    </div>
                  </dl>
                  {channel.last_error ? (
                    <p className={styles.channelError}>
                      <CircleAlert />
                      {channel.last_error}
                    </p>
                  ) : null}
                  {result[channel.id] ? (
                    <p
                      className={
                        result[channel.id].tone === "success"
                          ? styles.testSuccess
                          : styles.channelError
                      }
                    >
                      {result[channel.id].tone === "success" ? (
                        <CheckCircle2 />
                      ) : (
                        <CircleAlert />
                      )}
                      {result[channel.id].message}
                    </p>
                  ) : null}
                  <footer>
                    {removeId === channel.id ? (
                      <>
                        <span>Remove this channel?</span>
                        <button onClick={() => setRemoveId("")}>Cancel</button>
                        <button
                          className={styles.removeConfirm}
                          disabled={busy === `remove:${channel.id}`}
                          onClick={() => void remove(channel)}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={
                            !configured ||
                            !canManage ||
                            busy === `test:${channel.id}`
                          }
                          onClick={() => void test(channel)}
                        >
                          <Send />
                          {busy === `test:${channel.id}`
                            ? "Sending…"
                            : "Send test"}
                        </button>
                        <button
                          aria-label={`Remove ${channel.label}`}
                          disabled={!canManage}
                          onClick={() => setRemoveId(channel.id)}
                        >
                          <Trash2 />
                        </button>
                      </>
                    )}
                  </footer>
                </article>
              );
            })}
            {!channels.length ? (
              <div className={styles.empty}>
                <BellRing />
                <h3>No delivery channel yet.</h3>
                <p>
                  In-app notifications already work. Connect a destination when
                  your team wants release changes outside GuardRails.
                </p>
              </div>
            ) : null}
          </section>
          {canManage ? (
            <section className={styles.connect}>
              <header>
                <span>Connect a destination</span>
                <h2>Credentials stay encrypted.</h2>
                <p>
                  GuardRails validates each destination before saving it. Secret
                  values are never returned to the browser.
                </p>
              </header>
              <form onSubmit={submit}>
                <div className={styles.kindPicker}>
                  {[
                    ["slack_webhook", "Slack", <MessageSquare key="s" />],
                    ["email_resend", "Email", <Mail key="e" />],
                    ["generic_webhook", "Webhook", <Webhook key="w" />],
                    ["jira_cloud", "Jira Cloud", <BellRing key="j" />],
                  ].map(([id, label, Icon]) => (
                    <button
                      type="button"
                      key={String(id)}
                      className={kind === id ? styles.kindActive : ""}
                      onClick={() => setKind(String(id))}
                    >
                      {Icon}
                      {String(label)}
                    </button>
                  ))}
                </div>
                <div className={styles.formGrid}>
                  <label>
                    Channel name
                    <input
                      name="label"
                      required
                      maxLength={80}
                      placeholder="Security updates"
                    />
                  </label>
                  <label>
                    Minimum severity
                    <select name="severity" defaultValue="MEDIUM">
                      <option>CRITICAL</option>
                      <option>HIGH</option>
                      <option>MEDIUM</option>
                      <option>LOW</option>
                      <option>INFORMATIONAL</option>
                    </select>
                  </label>
                  {kind === "slack_webhook" || kind === "generic_webhook" ? (
                    <label className={styles.full}>
                      {kind === "slack_webhook"
                        ? "Slack incoming webhook"
                        : "HTTPS webhook URL"}
                      <input
                        name="webhook_url"
                        required
                        type="url"
                        placeholder={
                          kind === "slack_webhook"
                            ? "https://hooks.slack.com/services/…"
                            : "https://security.example.com/guardrails"
                        }
                      />
                    </label>
                  ) : null}
                  {kind === "email_resend" ? (
                    <label className={styles.full}>
                      Recipient email
                      <input
                        name="email"
                        required
                        type="email"
                        placeholder="security@example.com"
                      />
                    </label>
                  ) : null}
                  {kind === "jira_cloud" ? (
                    <>
                      <label>
                        Jira site
                        <input
                          name="jira_site"
                          required
                          type="url"
                          placeholder="https://company.atlassian.net"
                        />
                      </label>
                      <label>
                        Project key
                        <input
                          name="jira_project_key"
                          required
                          placeholder="SEC"
                        />
                      </label>
                      <label>
                        Jira account email
                        <input name="jira_email" required type="email" />
                      </label>
                      <label>
                        API token
                        <input
                          name="jira_api_token"
                          required
                          type="password"
                          autoComplete="new-password"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                {formState === "error" ? (
                  <p className={styles.formError} role="alert">
                    <CircleAlert />
                    {message}
                  </p>
                ) : null}
                <button
                  className={styles.connectButton}
                  disabled={!configured || formState === "saving"}
                >
                  {formState === "saving"
                    ? "Validating destination…"
                    : "Validate and connect"}
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <div className={styles.eventStack}>
          <section className={styles.digestCard}>
            <header>
              <div>
                <span>Weekly security digest</span>
                <h2>A weekly queue of release changes.</h2>
                <p>
                  Every week, GuardRails summarizes release changes,
                  high-priority evidence, decisions, and the queue that still
                  needs an owner.
                </p>
              </div>
              <label className={styles.digestToggle}>
                <span>{preferences.weekly_digest ? "On" : "Off"}</span>
                <input
                  type="checkbox"
                  checked={preferences.weekly_digest}
                  disabled={!canManage || busy === "weekly_digest"}
                  onChange={(event) =>
                    void savePreference("weekly_digest", event.target.checked)
                  }
                />
              </label>
            </header>
            <div className={styles.digestBody}>
              <div className={styles.digestPreview}>
                <span>Next digest preview</span>
                <strong>
                  {digestPreview.needsReview
                    ? `${digestPreview.needsReview} ${digestPreview.needsReview === 1 ? "release needs" : "releases need"} review`
                    : "Your review queue is clear"}
                </strong>
                <p>
                  {digestPreview.changes} recent changes ·{" "}
                  {digestPreview.monitored} monitored extensions
                </p>
                <small>
                  Delivered only to connected Slack and email channels. Jira and
                  generic webhooks continue receiving event-level alerts.
                </small>
              </div>
              <div className={styles.digestSchedule}>
                <label>
                  Delivery day
                  <select
                    value={preferences.digest_weekday}
                    disabled={!canManage || busy === "digest_weekday"}
                    onChange={(event) =>
                      void savePreference(
                        "digest_weekday",
                        Number(event.target.value),
                      )
                    }
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day, index) => (
                      <option value={index + 1} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time (UTC)
                  <select
                    value={preferences.digest_hour_utc}
                    disabled={!canManage || busy === "digest_hour_utc"}
                    onChange={(event) =>
                      void savePreference(
                        "digest_hour_utc",
                        Number(event.target.value),
                      )
                    }
                  >
                    {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => (
                      <option value={hour} key={hour}>
                        {String(hour).padStart(2, "0")}:00 UTC
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span>Eligible channels</span>
                  <strong>
                    {
                      channels.filter(
                        (channel) =>
                          ["slack_webhook", "email_resend"].includes(
                            channel.kind,
                          ) && channel.enabled,
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <span>Last digest</span>
                  <strong>
                    {digestDeliveries.find(
                      (delivery) => delivery.status === "sent",
                    )
                      ? formatTime(
                          digestDeliveries.find(
                            (delivery) => delivery.status === "sent",
                          )?.delivered_at || null,
                        )
                      : "Not sent yet"}
                  </strong>
                </div>
              </div>
            </div>
            {(
              ["weekly_digest", "digest_weekday", "digest_hour_utc"] as const
            ).map((field) =>
              result[field]?.tone === "error" ? (
                <p className={styles.digestError} role="alert" key={field}>
                  <CircleAlert />
                  {result[field].message}
                </p>
              ) : null,
            )}
          </section>
          <section className={styles.events}>
            <header>
              <span>Immediate return rules</span>
              <h2>Only notify for changes worth seeing now.</h2>
              <p>
                In-app activity keeps the full record. These controls decide
                which events are also delivered immediately to connected
                channels.
              </p>
            </header>
            {events.map(([field, title, copy]) => (
              <label key={field}>
                <span>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                  {result[field]?.tone === "error" ? (
                    <em className={styles.eventError} role="alert">
                      {result[field].message}
                    </em>
                  ) : null}
                </span>
                <input
                  type="checkbox"
                  checked={preferences[field]}
                  disabled={!canManage || busy === field}
                  onChange={(event) =>
                    void savePreference(field, event.target.checked)
                  }
                />
              </label>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
function provider(kind: string) {
  return kind === "slack_webhook"
    ? "Slack"
    : kind === "generic_webhook"
      ? "Webhook"
      : kind === "jira_cloud"
        ? "Jira Cloud"
        : kind === "email_resend"
          ? "Email"
          : "Provider";
}
function icon(kind: string) {
  return kind === "slack_webhook" ? (
    <MessageSquare />
  ) : kind === "email_resend" ? (
    <Mail />
  ) : kind === "generic_webhook" ? (
    <Webhook />
  ) : (
    <BellRing />
  );
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function formatTime(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}
