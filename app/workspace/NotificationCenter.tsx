"use client";

import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleAlert,
  Send,
  X,
} from "lucide-react";
import styles from "./notificationCenter.module.css";

type Delivery = {
  status: string;
  delivered_at: string | null;
  last_error: string | null;
};
type Alert = {
  id: string;
  title: string;
  summary: string;
  extension_id: string;
  version: string;
  team_notification_deliveries?: Delivery[];
};

export default function NotificationCenter({
  alerts,
  onClose,
  onOpenActivity,
}: {
  alerts: Alert[];
  onClose: () => void;
  onOpenActivity: () => void;
}) {
  const failures = alerts.filter((alert) =>
    alert.team_notification_deliveries?.some(
      (delivery) => delivery.status === "failed",
    ),
  );
  return (
    <aside
      className={styles.center}
      role="dialog"
      aria-modal="false"
      aria-labelledby="notification-center-title"
    >
      <header>
        <div>
          <span>Workspace notifications</span>
          <h2 id="notification-center-title">Release changes awaiting your team.</h2>
        </div>
        <button onClick={onClose} aria-label="Close notifications">
          <X />
        </button>
      </header>
      <section className={styles.summary}>
        <article>
          <Bell />
          <span>
            <strong>{alerts.length}</strong> active update
            {alerts.length === 1 ? "" : "s"}
          </span>
        </article>
        <article className={failures.length ? styles.warning : ""}>
          {failures.length ? <CircleAlert /> : <CheckCircle2 />}
          <span>
            <strong>{failures.length}</strong> delivery issue
            {failures.length === 1 ? "" : "s"}
          </span>
        </article>
      </section>
      <div className={styles.feed}>
        {alerts.slice(0, 6).map((alert) => {
          const failed = alert.team_notification_deliveries?.some(
            (delivery) => delivery.status === "failed",
          );
          const sent = alert.team_notification_deliveries?.some(
            (delivery) => delivery.status === "sent",
          );
          return (
            <article key={alert.id}>
              <span
                className={
                  failed ? styles.failed : sent ? styles.sent : styles.inApp
                }
              >
                {failed ? <CircleAlert /> : sent ? <Send /> : <Bell />}
              </span>
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.summary}</p>
                <small>
                  {alert.extension_id}@{alert.version} ·{" "}
                  {failed
                    ? "Delivery needs attention"
                    : sent
                      ? "Delivered"
                      : "In-app"}
                </small>
              </div>
            </article>
          );
        })}
        {!alerts.length ? (
          <div className={styles.empty}>
            <CheckCircle2 />
            <strong>You’re caught up.</strong>
            <p>
              Meaningful release changes and delivery problems will appear here.
            </p>
          </div>
        ) : null}
      </div>
      <footer>
        <button onClick={onOpenActivity}>
          Open all activity <ArrowRight />
        </button>
      </footer>
    </aside>
  );
}
