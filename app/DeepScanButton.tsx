"use client";
import { useEffect, useState } from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ScanSearch } from "lucide-react";
import Link from "next/link";
import { trackProductEvent } from "@/lib/analyticsEvents";
import { extensionPageModel } from "@/lib/extensionPageModel";
import { browserAuthHeaders } from "@/lib/browserAuth";
import { browserDb } from "@/lib/supabase";

type ScanState =
  | "idle"
  | "loading"
  | "queued"
  | "running"
  | "complete"
  | "incomplete"
  | "error";
type Health = {
  accepting_requests?: boolean;
  status?: "ready" | "runner_delayed" | "configuration_unavailable";
};
type ExistingJob = {
  auth_required?: boolean;
  guest_trial_available?: boolean;
  guest_trial_remaining?: number;
  guest_trial_limit?: number;
  report_url?: string;
  status?: string;
  id?: string;
  error?: string;
  dispatch?: string;
} | null;

async function fetchDeepScanHealth(): Promise<Health> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("/api/deep-scans/health", {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as Health | null;
    if (
      !body ||
      !["ready", "runner_delayed", "configuration_unavailable"].includes(
        String(body.status),
      )
    )
      throw new Error("Invalid Deep Scan health response.");
    if (!response.ok && body.status !== "configuration_unavailable")
      throw new Error(`Request failed with ${response.status}`);
    return body;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchExistingJob(
  extensionId: string,
  version: string,
  headers: Record<string, string>,
): Promise<ExistingJob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(
      `/api/deep-scans?extension_id=${encodeURIComponent(extensionId)}&version=${encodeURIComponent(version)}`,
      { cache: "no-store", headers, signal: controller.signal },
    );
    if (response.status === 204) return null;
    if (response.status === 401) return { auth_required: true };
    if (!response.ok) return null;
    return (await response.json()) as ExistingJob;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function DeepScanButton({
  extensionId,
  version,
  showReportLink = true,
}: {
  extensionId: string;
  version: string;
  showReportLink?: boolean;
}) {
  const db = useMemo(() => browserDb(), []);
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [health, setHealth] = useState<
    | "checking"
    | "ready"
    | "runner_delayed"
    | "configuration_unavailable"
    | "network_unavailable"
  >("checking");
  const [message, setMessage] = useState("");
  const [jobId, setJobId] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [guestTrialAvailable, setGuestTrialAvailable] = useState(false);
  const [guestTrialRemaining, setGuestTrialRemaining] = useState(0);

  useEffect(() => {
    let active = true;
    void browserAuthHeaders(db).then((headers) => Promise.allSettled([
      fetchDeepScanHealth(),
      fetchExistingJob(extensionId, version, headers),
    ])).then(([healthResult, jobResult]) => {
      if (!active) return;
      if (healthResult.status === "fulfilled") {
        const runner = healthResult.value;
        setHealth(
          runner.accepting_requests
            ? runner.status === "runner_delayed"
              ? "runner_delayed"
              : "ready"
            : "configuration_unavailable",
        );
      } else {
        setHealth("network_unavailable");
      }
      const job = jobResult.status === "fulfilled" ? jobResult.value : null;
      if (job?.auth_required) {
        setSignedOut(true);
        setGuestTrialAvailable(false);
      } else if (job?.guest_trial_available) {
        setSignedOut(false);
        setGuestTrialAvailable(true);
        setGuestTrialRemaining(Number(job.guest_trial_remaining || 0));
      }
      if (job?.auth_required) setSignedOut(true);
      else if (job?.report_url) {
        const terminal =
          job.status === "incomplete" ? "incomplete" : "complete";
        setReportUrl(String(job.report_url));
        setState(terminal);
        setMessage(
          showReportLink
            ? terminal === "complete"
              ? "Completed Deep Scan is available for this exact release."
              : "The Deep Scan is incomplete. Review missing coverage before making a trust decision."
            : "",
        );
      } else if (job?.status === "queued" || job?.status === "running") {
        const nextState: ScanState = job.status;
        setJobId(String(job.id || ""));
        setState(nextState);
        setMessage(
          nextState === "queued"
            ? job.dispatch === "scheduled"
              ? "Queued for the next scheduled isolated analysis runner."
              : "Starting the isolated analysis runner…"
            : "Analyzers are inspecting the exact artifact.",
        );
      } else if (job?.status === "failed") {
        setState("error");
        setMessage(
          job.error ||
            "The previous Deep Scan failed. Retry when the runner is available.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [db, extensionId, version, showReportLink]);

  useEffect(() => {
    if (!jobId) return;
    const startedAt = Date.now();
    let requestInFlight = false;
    let consecutiveFailures = 0;
    const timer = window.setInterval(async () => {
      if (requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      let response: Response;
      let body: { status?: string; report_url?: string; error?: string };
      try {
        const headers = await browserAuthHeaders(db);
        response = await fetch(`/api/deep-scans/${jobId}`, { cache: "no-store", headers });
        body = await response.json().catch(() => ({}));
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setMessage(
            "Progress updates are temporarily offline. The scan is still running and will reconnect automatically.",
          );
        }
        requestInFlight = false;
        return;
      }
      requestInFlight = false;
      if (response.status === 401) {
        setSignedOut(true);
        setState("idle");
        setMessage(
          "Your session expired. Sign in again to continue following this scan.",
        );
        window.clearInterval(timer);
        return;
      }
      if ([429, 502, 503, 504].includes(response.status)) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3)
          setMessage(
            "The analysis service is delayed. This page will keep reconnecting safely.",
          );
        return;
      }
      if (!response.ok) {
        setState("error");
        setMessage(body.error || "Scan progress is unavailable.");
        window.clearInterval(timer);
        return;
      }
      consecutiveFailures = 0;
      if (["complete", "incomplete"].includes(String(body.status))) {
        const terminal =
          body.status === "incomplete" ? "incomplete" : "complete";
        setState(terminal);
        setReportUrl(
          String(
            body.report_url ||
              extensionPageModel(extensionId, version, null).reportHref,
          ),
        );
        setMessage(
          terminal === "complete"
            ? "Deep Scan complete. Your Analysis Report is ready."
            : "Deep Scan is incomplete. Review the missing checks before making a trust decision.",
        );
        window.clearInterval(timer);
        router.refresh();
      } else if (body.status === "failed") {
        setState("error");
        setMessage(
          body.error || "Deep Scan failed. Retry when the runner is available.",
        );
        window.clearInterval(timer);
      } else {
        const nextState = body.status === "running" ? "running" : "queued";
        setState(nextState);
        // The runner is best-effort and can take a few minutes to start. Reassure
        // the user instead of leaving a silent spinner; the poll still resolves to
        // a terminal state on its own once the job passes its deadline.
        const waited = Date.now() - startedAt;
        if (waited > 120_000)
          setMessage(
            nextState === "running"
              ? "Still analyzing the exact artifact — larger extensions take a few minutes."
              : "Waiting for an available runner. This resolves automatically; you can safely leave this page.",
          );
        else
          setMessage(
            nextState === "running"
              ? "Analyzers are inspecting the exact artifact."
              : "Starting the isolated analysis runner…",
          );
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [db, jobId, router, extensionId, version]);

  async function queue() {
    if (signedOut && !guestTrialAvailable) {
      trackProductEvent({
        name: "workspace_signup_started",
        source_route: window.location.pathname,
        entry_point: "deep_scan",
      });
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.push(`/account?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!["ready", "runner_delayed", "network_unavailable"].includes(health))
      return;
    const force = state === "complete" || state === "incomplete";
    setState("loading");
    setMessage("");
    let response: Response;
    let body: {
      error?: string;
      status?: string;
      report_url?: string;
      id?: string;
      trial_remaining?: number;
      dispatch?: string;
    };
    try {
      const headers = await browserAuthHeaders(db);
      response = await fetch("/api/deep-scans", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ extension_id: extensionId, version, force }),
      });
      body = await response.json().catch(() => ({}));
    } catch {
      setState("error");
      setMessage(
        "Deep Scan could not reach the analysis service. Check your connection and try again.",
      );
      return;
    }
    if (response.status === 401) {
      trackProductEvent({
        name: "workspace_signup_started",
        source_route: window.location.pathname,
        entry_point: "deep_scan",
      });
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.push(`/account?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!response.ok) {
      setState("error");
      setMessage(body.error || "Deep Scan is temporarily unavailable.");
      return;
    }
    if (body.status === "complete") {
      setState("complete");
      setReportUrl(
        String(
          body.report_url ||
            extensionPageModel(extensionId, version, null).reportHref,
        ),
      );
      setMessage("A completed Deep Scan already exists for this version.");
      router.refresh();
      return;
    }
    if (!body.id) {
      setState("error");
      setMessage(
        "The analysis service accepted the request without a trackable job. Try again.",
      );
      return;
    }
    setJobId(String(body.id));
    setState(body.status === "running" ? "running" : "queued");
    setMessage(
      body.dispatch === "scheduled"
        ? "Queued for the next scheduled isolated analysis runner."
        : "Runner started. Preparing the exact published artifact for analysis.",
    );
  }

  const unavailable = health === "configuration_unavailable";
  return (
    <div
      className={
        showReportLink
          ? "deepScanAction deepScanActionWithReport"
          : "deepScanAction"
      }
    >
      <button
        className="button buttonDark"
        onClick={queue}
        disabled={
          (!signedOut &&
            !["ready", "runner_delayed", "network_unavailable"].includes(
              health,
            )) ||
          ["loading", "queued", "running"].includes(state)
        }
      >
        {signedOut && !guestTrialAvailable ? (
          <>
            Create free workspace to Deep Scan <ScanSearch size={16} />
          </>
        ) : health === "checking" ? (
          <>
            <LoaderCircle className="spin" size={16} /> Checking availability
          </>
        ) : unavailable ? (
          "Deep Scan unavailable"
        ) : state === "loading" ? (
          <>
            <LoaderCircle className="spin" size={16} /> Queueing
          </>
        ) : state === "queued" ? (
          "Queued"
        ) : state === "running" ? (
          <>
            <LoaderCircle className="spin" size={16} /> Analyzing
          </>
        ) : ["complete", "incomplete"].includes(state) ? (
          <>
            Run a new scan <ScanSearch size={16} />
          </>
        ) : (
          <>
            Deep Scan <ScanSearch size={16} />
          </>
        )}
      </button>
      {guestTrialAvailable && !signedOut ? (
        <span className="actionNotice" role="status">
          {guestTrialRemaining || 5} free Deep Scan{guestTrialRemaining === 1 ? "" : "s"} without sign-in. Sign in to save history and monitor releases.
        </span>
      ) : null}
      {showReportLink && reportUrl ? (
        <Link className="deepScanReportLink" href={reportUrl}>
          Open Analysis Report
        </Link>
      ) : null}
      {!signedOut &&
        (health === "configuration_unavailable" ? (
          <span className="actionError" role="status">
            Deep Scan is temporarily unavailable. No scan job was created.
          </span>
        ) : health === "network_unavailable" && !message ? (
          <span className="actionNotice" role="status">
            Availability could not be checked. You can still start a Deep Scan.
          </span>
        ) : message ? (
          <span
            className={state === "error" ? "actionError" : "actionNotice"}
            role="status"
          >
            {message}
          </span>
        ) : null)}
    </div>
  );
}
