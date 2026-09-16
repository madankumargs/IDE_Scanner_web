"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FolderOpen,
  Import,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { deleteImportedReport, listImportedReports } from "@/lib/reportBundle";
import styles from "./reports.module.css";

const bundleFiles = [
  ["metadata.json", "Scan identity and analyzer versions"],
  ["summary.json", "Decisions and review priorities"],
  ["leaderboard.json", "Compact extension results"],
  ["extensions/*.json", "Exact findings and artifact evidence"],
  ["rules.json", "Rules used for the analysis"],
  ["posture.json", "Separate editor configuration posture"],
] as const;

export default function ReportsPage() {
  const [reports, setReports] = useState<
    ReturnType<typeof listImportedReports>
  >([]);
  const [ready, setReady] = useState(false);
  const [pendingDelete, setPendingDelete] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setReports(listImportedReports());
      setReady(true);
    });
  }, []);

  const summary = useMemo(
    () => ({
      reports: reports.length,
      extensions: reports.reduce(
        (total, report) => total + report.leaderboard.extensions.length,
        0,
      ),
      review: reports.reduce(
        (total, report) =>
          total +
          report.leaderboard.extensions.filter(
            (item) => item.decision === "review",
          ).length,
        0,
      ),
    }),
    [reports],
  );

  function remove(id: string) {
    deleteImportedReport(id);
    setReports(listImportedReports());
    setPendingDelete("");
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <LockKeyhole /> Private report library
          </span>
          <h1>
            Bring the evidence.
            <br />
            <em>Keep the decision portable.</em>
          </h1>
          <p>
            Open GuardRails report bundles without uploading them. Every result
            stays attached to the exact extension version, artifact hash, and
            rules that produced it.
          </p>
          <div className={styles.heroActions}>
            <Link href="/scan">
              <Import /> Import a report <ArrowRight />
            </Link>
            <Link href="/registry">Browse the public registry</Link>
          </div>
        </div>
        <div
          className={styles.reportPreview}
          aria-label="Portable report preview"
        >
          <header>
            <span>
              <ShieldCheck /> GuardRails evidence
            </span>
            <b>Browser only</b>
          </header>
          <div>
            <small>EXACT RELEASE</small>
            <strong>GitHub.copilot@1.250.0</strong>
            <code>sha256 · 9a83…71c2</code>
          </div>
          <article>
            <span>Decision</span>
            <strong>Review</strong>
          </article>
          <article>
            <span>Permission change</span>
            <strong>Network +1</strong>
          </article>
          <footer>
            <CheckCircle2 /> Evidence identity verified
          </footer>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Saved report summary">
        <article>
          <span>Saved reports</span>
          <strong>{summary.reports}</strong>
          <small>Stored in this browser</small>
        </article>
        <article>
          <span>Extensions</span>
          <strong>{summary.extensions}</strong>
          <small>Across imported bundles</small>
        </article>
        <article>
          <span>Need review</span>
          <strong>{summary.review}</strong>
          <small>Decisions requiring attention</small>
        </article>
      </section>

      <section className={styles.library}>
        <header>
          <div>
            <span>Report library</span>
            <h2>
              {reports.length
                ? "Continue where you left off."
                : "Your evidence library is ready."}
            </h2>
            <p>Imported reports remain on this device until you remove them.</p>
          </div>
          <Link href="/scan">
            <Import /> Import report
          </Link>
        </header>

        {!ready ? (
          <div className={styles.loading} role="status">
            <i />
            <i />
            <i />
            <span>Opening your local report library…</span>
          </div>
        ) : reports.length ? (
          <div className={styles.rows}>
            {reports.map((report) => {
              const totals = report.summary.summary;
              const primary = report.leaderboard.extensions[0];
              return (
                <article key={report.id}>
                  <span className={styles.icon}>
                    <ShieldCheck />
                  </span>
                  <div className={styles.identity}>
                    <small>{primary?.extension_id || "Imported report"}</small>
                    <strong>
                      {primary?.name || primary?.extension_id || report.name}
                    </strong>
                    <code>
                      {primary
                        ? `Version ${primary.version}`
                        : report.metadata.scan_id}
                    </code>
                  </div>
                  <div className={styles.outcome}>
                    <span>Decision</span>
                    <b data-decision={primary?.decision || "incomplete"}>
                      {primary?.decision || "Incomplete"}
                    </b>
                  </div>
                  <div className={styles.signal}>
                    <span>Highest signal</span>
                    <strong>
                      {Math.max(
                        totals.max_risk_score,
                        totals.max_malware_score,
                      )}
                    </strong>
                  </div>
                  <Link
                    className={styles.open}
                    href={`/reports/${encodeURIComponent(report.id)}`}
                  >
                    Open report <ArrowRight />
                  </Link>
                  <button
                    className={styles.delete}
                    onClick={() => setPendingDelete(report.id)}
                    aria-label={`Remove ${report.name}`}
                  >
                    <Trash2 />
                  </button>
                  {pendingDelete === report.id ? (
                    <div
                      className={styles.confirm}
                      role="alertdialog"
                      aria-modal="true"
                      aria-label="Remove imported report"
                    >
                      <div>
                        <strong>Remove this local report?</strong>
                        <p>
                          This only clears the imported bundle from this
                          browser. It does not affect a public Deep Scan.
                        </p>
                      </div>
                      <button onClick={() => setPendingDelete("")}>
                        <X /> Keep report
                      </button>
                      <button onClick={() => remove(report.id)}>
                        <Trash2 /> Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <span>
              <FolderOpen />
            </span>
            <h3>No reports saved on this device.</h3>
            <p>
              Import a GuardRails bundle to review it privately, or analyze a
              published extension to create new exact-version evidence.
            </p>
            <div>
              <Link href="/scan">
                Import or analyze <ArrowRight />
              </Link>
              <Link href="/registry">Browse public reports</Link>
            </div>
          </div>
        )}
      </section>

      <details className={styles.contract}>
        <summary>
          <span>
            <FileArchive /> Portable report contents
          </span>
          <strong>
            See what stays attached to a report <ArrowRight />
          </strong>
        </summary>
        <div>
          <header>
            <h2>A report carries its own evidence boundary.</h2>
            <p>
              GuardRails displays the scanner result as recorded. The browser
              does not recreate findings or silently recalculate a decision.
            </p>
          </header>
          <div className={styles.files}>
            {bundleFiles.map(([name, detail]) => (
              <article key={name}>
                <FileArchive />
                <div>
                  <code>{name}</code>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </main>
  );
}
