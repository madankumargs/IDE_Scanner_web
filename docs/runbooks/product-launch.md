# Product Launch Runbook

## Release gate

Run `npm run launch:readiness -- --with-health` with `LAUNCH_HEALTH_URL` and
`LAUNCH_HEALTH_SECRET` set. Do not promote when the active public release is
missing, incomplete, stale, or the health endpoint reports a non-2xx response.

Before building or activating a Cloudflare publication, run the scanner's
version-pinned production corpus benchmark with `IDE_SCANNER_BUILD_SHA` set to
the exact scanner commit. Pass its JSON result to both
`build-cloudflare-publication-validation.mjs --accuracy-gate` and
`activate-cloudflare-scan-publication.mjs --accuracy-gate`. The scripts reject
failed gates, unknown build identities, mismatched policy/ruleset versions, and
gates with no known-safe or known-malicious evaluation. A release must not be
expanded merely because its scan jobs completed.

The production corpus is a deterministic regression suite, not an ecosystem
accuracy claim. The gate artifact must also carry a separate
`holdout` object with `status: "fresh-labeled"`, `complete: true`, and positive
`safe_evaluated` and `malicious_evaluated` counts from exact retained artifacts.
Until that holdout exists, the registry may keep its current release but must
not activate or bulk-publish a new cohort.

## Runner outage

The public report remains available. Pause acquisition copy that promises a new
scan, inspect `scan_runner_status`, and restore the GitHub Actions runner.
Queued work is retained; do not manually rewrite report outcomes.

**Metric:** launch health `runner_status` and `runner_last_seen_at`.
**Responsible role:** on-call platform engineer.

## Failed scan ingestion

Inspect callback receipts and the atomic scan-result ingestion logs. Retry only
the exact job after fixing the callback or runner issue. A failed/incomplete
scan must remain incomplete; never convert it to an allow decision.

**Metric:** launch health `current_report_count`, scanner callback failures, and incomplete scan count.
**Responsible role:** scanner maintainer.

## Incorrect public classification

Deactivate or replace the active publication release through the existing
release activation procedure. Preserve the immutable scan record and publish a
new, complete release identity; do not mutate an artifact report in place.

**Metric:** active release identity, public decision audit log, and report count.
**Responsible role:** security lead.

## Stale public release

Run catalog refresh, confirm the expected report count, then activate a new
release only after the exact cohort is complete. The catalog workflow calls
launch health and must fail until this condition is restored.

**Metric:** launch health `active_release`, `current_report_count`, and `newest_scan_at`.
**Responsible role:** release manager.

## Notification provider outage

Disable the affected team channel. The worker records bounded failures and
stops after five attempts; re-enable a validated channel after the provider is
healthy. Do not expose encrypted targets in debugging output.

**Metric:** launch health `notification_failure_rate`, team delivery status, and retry attempt count.
**Responsible role:** on-call platform engineer.

## RLS regression

Pause workspace mutations, apply the last known-good migration state through a
forward corrective migration, and verify owner/admin/analyst/viewer/non-member
access against a staging Supabase project before resuming production writes.

**Metric:** RLS fixture result and Supabase security advisor output.
**Responsible role:** database security owner.
