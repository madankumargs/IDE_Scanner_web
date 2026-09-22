# Product Launch Runbook

## Release gate

Run `npm run launch:readiness -- --with-health` with `LAUNCH_HEALTH_URL` and
`LAUNCH_HEALTH_SECRET` set. Do not promote when the active public release is
missing, incomplete, stale, or the health endpoint reports a non-2xx response.

Before building or activating either a Cloudflare/D1 or Supabase publication,
run the scanner's version-pinned production corpus benchmark with
`IDE_SCANNER_BUILD_SHA` set to the exact scanner commit, then build the
combined accuracy gate. Pass that same gate JSON to the matching validation
and activation scripts:

* Cloudflare/D1: `build-cloudflare-publication-validation.mjs
  --accuracy-gate`, then `activate-cloudflare-scan-publication.mjs
  --accuracy-gate`.
* Supabase: `build-publication-validation.mjs --accuracy-gate`, then
  `activate-scan-publication.mjs --accuracy-gate`.

The Supabase accuracy-gate migration must be applied before using the updated
activation script. All four scripts reject failed gates, unknown build
identities, mismatched policy/ruleset versions, and gates with no known-safe or
known-malicious evaluation. A release must not be expanded merely because its
scan jobs completed.

The production corpus is a deterministic regression suite, not an ecosystem
accuracy claim. Public/benchmark callbacks also require the deep profile and
controlled Bubblewrap runtime evidence; static-only results are rejected at
both callback backends. The gate artifact must also carry a separate
`holdout` object with `status: "fresh-labeled"`, `complete: true`, and positive
`safe_evaluated` and `malicious_evaluated` counts from exact retained artifacts.
The holdout `safe_review_rate` must also be at or below the 20% noise ceiling;
a safe extension routed to review is still publication noise even when it is not
blocked.
The holdout must include both at least one executable-capability artifact whose
dynamic provider actually ran and at least one artifact explicitly classified as
runtime-not-applicable. This proves that agentic/process-capable packages and
non-executable packages are being routed through different evidence contracts.
Until that holdout exists, the registry may keep its current release but must
not activate or bulk-publish a new cohort.

The scanner repository now starts the holdout automatically after a successful
main-branch production gate. Use the `Validate and promote scanner publication`
workflow with that scanner workflow-run ID. It downloads the immutable
`publication-accuracy-gate.json`, validates the exact scanner SHA against the
current Cloudflare D1 reports, and uploads a validation artifact. Leave
`activate` disabled for a dry validation; enable it only after the validation
job succeeds. Missing cross-repository or Cloudflare credentials fail the
workflow rather than producing a successful no-op.

The holdout workflow first runs
`scripts/verify_holdout_provenance.py` against the versioned exact-hash
advisory snapshot, then freezes the retained artifacts. Evidence must identify
the exact extension id, version, and SHA-256, and its retrieval timestamp must
not be later than the declared freeze time. Do not hand-edit the generated
corpus or gate; regenerate them from the reviewed source manifest.

The website repository must have `SCANNER_REPO_READ_TOKEN` with read access to
the scanner repository's Actions artifacts, plus `SUPABASE_PASSWORD`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and the existing
`CLOUDFLARE_API_TOKEN` and account configuration. The promotion workflow builds
and activates both the Supabase publication consumed by the website export and
the Cloudflare/D1 publication consumed by the runtime registry. Both manifests
must contain exactly the requested cohort size. Each activation re-reads the
manifest scans and rechecks the exact artifact identity, canonical report,
decision, policy/ruleset, and runtime contract immediately before flipping its
release active. A previously generated validation artifact is not sufficient by
itself.

The public registry mirror uses generation-addressed D1 chunks. The import
script stages all sections and products under a new publication ID, then flips
one active pointer as its first visible write; cleanup runs only after the
pointer is live. A failed or interrupted mirror import therefore leaves the
previous complete registry snapshot readable.

## Cohort scaling

Catalog refresh is intentionally separate from publication activation. After
the holdout gate passes, use the promotion workflow's optional
`queue_bulk_scan` handoff, or dispatch a staged refresh with the workflow
inputs `cohort_limit`, `marketplace_page_count`, and `scan_batch_limit` (for
example `1000`, `10`, and `250`). These values are bounded by the refresh
script and only queue exact Deep Scan jobs; they do not replace the active
public release.
Wait for every required report to be complete under one scanner build, build a
new publication validation report, and activate it with the same accuracy gate.
If the holdout or report-completeness gate fails, leave the existing release
active and investigate the rule or worker evidence before increasing the cohort.

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
