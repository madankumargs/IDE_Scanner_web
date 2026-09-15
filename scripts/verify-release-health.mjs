import { fileURLToPath } from "node:url";

const RUNNER_DELAY_REASON = "Deep Scan runner is runner_delayed.";
const STALE_PUBLICATION_REASONS = new Set([
  "Active release is missing published reports.",
  "Public scan corpus is older than 30 hours.",
]);

/**
 * Classify the protected release-health response for the catalog workflow.
 * A delayed GitHub runner is observable and still accepts queued requests, so
 * it should warn without making an otherwise successful catalog refresh fail.
 */
export function classifyReleaseHealth(status, body) {
  if (status >= 200 && status < 300 && body?.healthy === true) {
    return { outcome: "pass", message: "Public release health passed." };
  }

  if (
    status === 503 &&
    body?.healthy === false &&
    Array.isArray(body.reasons) &&
    body.reasons.length === 1 &&
    body.reasons[0] === RUNNER_DELAY_REASON
  ) {
    return {
      outcome: "warn",
      message: `${RUNNER_DELAY_REASON} Catalog refresh completed; queued scans remain accepted.`,
    };
  }

  // Catalog refresh and scan publication are separate pipelines. An older
  // immutable release can remain stale after later scans supersede members,
  // while the database, runner, and current scan pipeline are healthy. Keep
  // that condition visible as a warning without marking catalog refresh as a
  // failed deployment.
  if (
    status === 503 &&
    body?.healthy === false &&
    body?.runner_status === "ready" &&
    body?.scan_failure_rate === 0 &&
    body?.notification_failure_rate === 0 &&
    Number(body?.current_report_count || 0) > 0 &&
    Array.isArray(body.reasons) &&
    body.reasons.length > 0 &&
    body.reasons.every((reason) => STALE_PUBLICATION_REASONS.has(reason))
  ) {
    return {
      outcome: "warn",
      message: "Catalog refresh completed; the older publication manifest needs a future scan-corpus refresh.",
    };
  }

  if (
    status === 503 &&
    body?.healthy === false &&
    body?.runner_status === "runner_delayed" &&
    body?.scan_failure_rate === 0 &&
    body?.notification_failure_rate === 0 &&
    Number(body?.current_report_count || 0) > 0 &&
    Array.isArray(body.reasons) &&
    body.reasons.length > 0 &&
    body.reasons.every((reason) => [RUNNER_DELAY_REASON, "Public scan corpus is older than 30 hours."].includes(reason))
  ) {
    return {
      outcome: "warn",
      message: "Catalog refresh completed; Cloudflare D1 has reports, while the GitHub scan runner heartbeat is delayed.",
    };
  }

  return {
    outcome: "fail",
    message: `Public release health failed: ${status} ${JSON.stringify(body)}`,
  };
}

async function main() {
  const baseUrl = process.env.LAUNCH_HEALTH_URL || "https://abscissa.dev";
  const secret = process.env.LAUNCH_HEALTH_SECRET;
  if (!secret) throw new Error("LAUNCH_HEALTH_SECRET is required.");

  const headers = { "x-guardrails-health-token": secret };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/launch-health`, { headers });
  const body = await response.json().catch(() => null);
  const result = classifyReleaseHealth(response.status, body);

  if (result.outcome === "pass") {
    console.log(result.message);
    return;
  }
  if (result.outcome === "warn") {
    console.warn(`::warning::${result.message}`);
    return;
  }
  throw new Error(result.message);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
