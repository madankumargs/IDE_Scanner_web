"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import TeamWorkspace from "@/app/TeamWorkspace";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";
import { sampleAlerts, sampleDecisions, sampleWatches } from "@/app/workspace/sampleData";
import styles from "./workspace.module.css";

export default function WorkspacePage() {
  const db = useMemo(() => browserDb(), []);
  // Anonymous visitors see the gate immediately; the session check runs in the
  // background and only swaps in the workspace once a session is confirmed.
  const [state, setState] = useState<"checking" | "ready" | "signed-out" | "error">("checking");

  useEffect(() => {
    document.body.classList.add("guardrails-workspace-mode");
    return () => document.body.classList.remove("guardrails-workspace-mode");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void browserAuthHeaders(db)
        .then((headers) => setState(headers.Authorization ? "ready" : "signed-out"))
        .catch(() => setState("error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [db]);

  if (state === "ready") return <TeamWorkspace />;
  if (state === "error") return <main className={styles.statePage}><ShieldAlert/><strong>Workspace unavailable</strong><p>We could not verify your session. Your public security reports are still available.</p><div className={styles.stateActions}><Link href="/account?next=/workspace">Sign in again <ArrowRight/></Link><Link href="/registry">Open registry</Link></div></main>;
  return <WorkspaceGate />;
}

function displayName(watch: (typeof sampleWatches)[number]) {
  const extensions = watch.extensions;
  const record = Array.isArray(extensions) ? extensions[0] : extensions;
  return record?.display_name || watch.extension_id;
}

function WorkspaceGate() {
  const clineWatch = sampleWatches[0];
  const clineDecision = sampleDecisions[0];
  const clineAlert = sampleAlerts[0];
  const eslintWatch = sampleWatches[2];
  return <main className={styles.gate}>
    <section className={styles.gateCopy}><span><i/> GuardRails workspace</span><h1>Every extension decision in one trusted place.</h1><p>Monitor exact releases, route meaningful changes to an owner, and keep the evidence behind every decision.</p><div className={styles.stateActions}><Link href="/account?next=/workspace">Create your workspace <ArrowRight/></Link><Link href="/registry">Explore public reports</Link></div><small>No credit card required · Public reports stay open</small></section>
    <section className={styles.gatePreview} aria-label="Example workspace preview">
      <header><span>Example workspace</span><em>Sample data</em></header>
      <div className={styles.previewMetrics}>
        <article><strong>{sampleDecisions.length}</strong><span>Need review</span></article>
        <article><strong>{sampleWatches.length}</strong><span>Monitored</span></article>
        <article><strong>1</strong><span>Open alert</span></article>
      </div>
      <div className={styles.previewItem}><b>UP</b><div><strong>{displayName(clineWatch)} · {clineDecision.extension_id}</strong><small>{clineWatch.baseline_version} → {clineDecision.version}</small></div><span>{clineAlert.title.replace(/^Cline /, "")}</span><em>Review</em></div>
      <div className={styles.previewItem}><b>BL</b><div><strong>{displayName(eslintWatch)} · {eslintWatch.extension_id}</strong><small>Baseline {eslintWatch.baseline_version} approved</small></div><span>No meaningful change</span><em className={styles.safe}>Ready</em></div>
      <p className={styles.previewNote}>Illustrative sample rows — your workspace starts empty and fills with your own extensions.</p>
    </section>
  </main>;
}
