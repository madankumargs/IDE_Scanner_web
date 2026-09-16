"use client";

import Link from "next/link";
import { LoaderCircle, ScanSearch, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserAuthHeaders } from "@/lib/browserAuth";
import { browserDb } from "@/lib/supabase";
import { badgeHtml, badgeMarkdown } from "@/lib/badgeSnippets";

type AuthState = "checking" | "signed-in" | "signed-out";
type ScanState = "idle" | "loading" | "queued" | "running" | "complete" | "error";
type BadgeScan = {
  extensionId: string;
  version: string;
  scanId: string;
  riskScore: number | null;
  malwareScore: number | null;
};

export default function BadgeBuilder({ origin }: { origin: string }) {
  const db = useMemo(() => browserDb(), []);
  const [extensionId, setExtensionId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("extension") || "";
  });
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const [scan, setScan] = useState<BadgeScan | null>(null);
  const normalizedId = extensionId.trim();
  const valid = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(normalizedId);
  const signInHref = `/account?next=${encodeURIComponent(`/badge?extension=${normalizedId}`)}`;
  const badgeUrl = scan
    ? `${origin}/api/badge?extension=${encodeURIComponent(scan.extensionId)}&version=${encodeURIComponent(scan.version)}`
    : "";
  const reportUrl = scan
    ? `${origin}/extensions/${encodeURIComponent(scan.extensionId)}/versions/${encodeURIComponent(scan.version)}/scans/${encodeURIComponent(scan.scanId)}`
    : "";
  const markdown = scan
    ? badgeMarkdown(badgeUrl, reportUrl)
    : "";
  const html = scan
    ? badgeHtml(badgeUrl, reportUrl)
    : "";

  useEffect(() => {
    let active = true;
    void browserAuthHeaders(db).then((headers) => {
      if (active) setAuthState(headers.Authorization ? "signed-in" : "signed-out");
    }).catch(() => {
      if (active) setAuthState("signed-out");
    });
    return () => { active = false; };
  }, [db]);

  const loadScan = useCallback(async (id: string, version: string, scanId: string) => {
    const response = await fetch(`/api/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/scans/${encodeURIComponent(scanId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { scan?: Record<string, unknown>; error?: string };
    if (!response.ok || !body.scan) throw new Error(body.error || "The completed scan report could not be loaded.");
    setScan({
      extensionId: String(body.scan.extension_id || id),
      version: String(body.scan.version || version),
      scanId: String(body.scan.id || scanId),
      riskScore: numberOrNull(body.scan.risk_score),
      malwareScore: numberOrNull(body.scan.malware_score),
    });
    setScanState("complete");
    setMessage("Scan complete. Your exact-version badge is ready.");
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let requestInFlight = false;
    const poll = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/deep-scans/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({})) as { status?: string; extension_id?: string; version?: string; scan_id?: string; error?: string };
        if (!active) return;
        if (response.status === 401) {
          setAuthState("signed-out");
          setJobId("");
          setScanState("error");
          setMessage("Your session expired. Sign in again to keep following this scan.");
        } else if (!response.ok) {
          setJobId("");
          setScanState("error");
          setMessage(body.error || "Scan progress is unavailable.");
        } else if (body.status === "complete" || body.status === "incomplete") {
          setJobId("");
          if (body.extension_id && body.version && body.scan_id) {
            await loadScan(body.extension_id, body.version, body.scan_id);
          } else {
            setScanState("error");
            setMessage("The scan completed without a report identity.");
          }
        } else if (body.status === "failed") {
          setJobId("");
          setScanState("error");
          setMessage(body.error || "The extension scan failed before a report was produced.");
        } else {
          setScanState(body.status === "running" ? "running" : "queued");
          setMessage(body.status === "running" ? "Analyzers are inspecting the exact release." : "Queued for the isolated analysis runner.");
        }
      } catch {
        if (active) setMessage("Progress updates are temporarily offline. The scan will reconnect automatically.");
      } finally {
        requestInFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId, loadScan]);

  async function startScan() {
    if (!valid || scanState === "loading" || scanState === "queued" || scanState === "running") return;
    const headers = await browserAuthHeaders(db);
    if (!headers.Authorization) {
      setAuthState("signed-out");
      return;
    }
    setScan(null);
    setJobId("");
    setScanState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/deep-scans", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ extension_id: normalizedId }),
      });
      const body = await response.json().catch(() => ({})) as { id?: string; status?: string; extension_id?: string; version?: string; scan_id?: string; dispatch?: string; error?: string };
      if (response.status === 401) {
        setAuthState("signed-out");
        setScanState("idle");
        return;
      }
      if (!response.ok) throw new Error(body.error || "The extension scan could not be started.");
      if (body.status === "complete" && body.extension_id && body.version && body.scan_id) {
        await loadScan(body.extension_id, body.version, body.scan_id);
        return;
      }
      if (!body.id) throw new Error("The scan was accepted without a trackable job.");
      setJobId(String(body.id));
      setScanState(body.status === "running" ? "running" : "queued");
      setMessage(body.dispatch === "scheduled" ? "Queued for the next scheduled isolated analysis runner." : "Runner started. Preparing the exact release for analysis.");
    } catch (cause) {
      setScanState("error");
      setMessage(cause instanceof Error ? cause.message : "The extension scan could not be started.");
    }
  }

  return (
    <div>
      <label htmlFor="badge-extension">Extension ID</label>
      <input
        id="badge-extension"
        value={extensionId}
        onChange={(event) => {
          setExtensionId(event.target.value);
          setScan(null);
          setScanState("idle");
          setMessage("");
        }}
        placeholder="publisher.extension-name"
        spellCheck={false}
      />
      {!valid ? <p>Enter an extension ID like <code>publisher.extension-name</code> to generate an exact-version badge.</p> : authState === "checking" ? <p>Checking sign-in…</p> : authState === "signed-out" ? <p><ShieldCheck /> Sign in before requesting the scan and generating a scored badge. <Link href={signInHref}>Sign in to scan this extension</Link></p> : <>
        <button type="button" onClick={() => void startScan()} disabled={scanState === "loading" || scanState === "queued" || scanState === "running"}>
          {scanState === "loading" || scanState === "queued" || scanState === "running" ? <LoaderCircle className="spin" /> : <ScanSearch />}
          {scanState === "loading" ? "Queueing scan…" : scanState === "queued" ? "Queued" : scanState === "running" ? "Scanning…" : scan ? "Scan again" : "Scan latest release"}
        </button>
        {message ? <p role="status">{message}</p> : null}
        {scan ? <>
          <p>
            Live preview —{" "}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badgeUrl} alt={`GuardRails badge for ${scan.extensionId}@${scan.version}`} height={20} />
          </p>
          <p><strong>Risk score:</strong> {displayScore(scan.riskScore)} · <strong>Malware score:</strong> {displayScore(scan.malwareScore)} · <Link href={reportUrl}>Open exact report</Link></p>
          <h3>Markdown (README.md)</h3>
          <pre>{markdown}</pre>
          <h3>HTML</h3>
          <pre>{html}</pre>
          <button type="button" onClick={() => void navigator.clipboard.writeText(markdown)}>Copy Markdown</button>{" "}
          <button type="button" onClick={() => void navigator.clipboard.writeText(html)}>Copy HTML</button>
        </> : null}
      </>}
    </div>
  );
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayScore(value: number | null): string {
  return value === null ? "Unavailable" : `${value}/100`;
}
