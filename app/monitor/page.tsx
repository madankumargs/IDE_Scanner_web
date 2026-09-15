"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  LoaderCircle,
  Radar,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import TeamWorkspace from "@/app/TeamWorkspace";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";
import styles from "./monitor.module.css";

export default function MonitorPage() {
  return (
    <Suspense fallback={<MonitorLoading />}>
      <MonitorPageContent />
    </Suspense>
  );
}

function MonitorPageContent() {
  const db = useMemo(() => browserDb(), []);
  const searchParams = useSearchParams();
  const extension = searchParams.get("extension") || "";
  const [state, setState] = useState<
    "loading" | "ready" | "signed-out" | "error"
  >("loading");

  useEffect(() => {
    let active = true;
    void browserAuthHeaders(db)
      .then((headers) => {
        if (!active) return;
        setState(headers.Authorization ? "ready" : "signed-out");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [db]);

  if (state === "loading") return <MonitorLoading />;
  if (state === "signed-out") return <MonitorGate extension={extension} />;
  if (state === "error") return <MonitorError />;
  return <TeamWorkspace initialExtension={extension} focus="monitor" />;
}

function MonitorLoading() {
  return (
    <main className={styles.statePage}>
      <span className={styles.stateIcon}>
        <LoaderCircle className={styles.spin} />
      </span>
      <strong>Opening release monitoring…</strong>
      <p>Checking your workspace and monitored extension baselines.</p>
    </main>
  );
}

function MonitorError() {
  return (
    <main className={styles.statePage}>
      <span className={styles.stateIcon}>
        <Radar />
      </span>
      <strong>Monitoring could not be opened.</strong>
      <p>
        Your public reports are unaffected. Retry the workspace connection or
        return to the registry.
      </p>
      <div className={styles.stateActions}>
        <button onClick={() => window.location.reload()}>
          <RefreshCw /> Try again
        </button>
        <Link href="/registry">Open registry</Link>
      </div>
    </main>
  );
}

function MonitorGate({ extension }: { extension: string }) {
  const destination = extension
    ? `/monitor?extension=${encodeURIComponent(extension)}`
    : "/monitor";
  return (
    <main className={styles.gate}>
      <section className={styles.gateHero}>
        <div>
          <span className={styles.eyebrow}>
            <BellRing /> Release monitoring
          </span>
          <h1>
            Approve once.
            <br />
            <em>Return only when it changes.</em>
          </h1>
          <p>
            GuardRails watches the exact extension release your team reviewed.
            When a new package appears, it creates a new evidence record and
            shows the permission difference before anyone approves the update.
          </p>
          {extension ? (
            <div className={styles.resume}>
              <CheckCircle2 />
              <span>
                <small>Ready to monitor</small>
                <strong>{extension}</strong>
              </span>
            </div>
          ) : null}
          <div className={styles.heroActions}>
            <Link href={`/account?next=${encodeURIComponent(destination)}`}>
              Create free workspace <ArrowRight />
            </Link>
            <Link href="/registry">Choose an extension</Link>
          </div>
          <small className={styles.publicNote}>
            Public extension reports remain available without an account.
          </small>
        </div>

        <div className={styles.loop} aria-label="Release monitoring workflow">
          <header>
            <span>
              <Radar /> Monitoring loop
            </span>
            <b>Exact releases</b>
          </header>
          <article>
            <i>01</i>
            <span>
              <small>Baseline</small>
              <strong>Reviewed version approved</strong>
              <p>Artifact and decision remain attached.</p>
            </span>
            <CheckCircle2 />
          </article>
          <article className={styles.active}>
            <i>02</i>
            <span>
              <small>New release</small>
              <strong>New version detected</strong>
              <p>A separate Deep Scan begins.</p>
            </span>
            <ScanSearch />
          </article>
          <article>
            <i>03</i>
            <span>
              <small>Review</small>
              <strong>2 new permissions</strong>
              <p>Terminal and network need attention.</p>
            </span>
            <ShieldCheck />
          </article>
          <footer>
            <BellRing />
            <span>
              <strong>One useful notification</strong>
              <small>Not another generic activity feed</small>
            </span>
          </footer>
        </div>
      </section>

      <section className={styles.promise}>
        <article>
          <strong>Version-bound baseline</strong>
          <p>The approved artifact never silently moves to “latest.”</p>
        </article>
        <article>
          <strong>Meaningful-change alerts</strong>
          <p>Return for permission, provenance, or coverage changes.</p>
        </article>
        <article>
          <strong>Decision history</strong>
          <p>Keep who approved each release and why.</p>
        </article>
      </section>
    </main>
  );
}
