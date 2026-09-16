# Team Badge production operations

Team badges are exact-release trust assets. A badge URL is tied to one immutable
scan/report identity; a newer monitored release marks that record stale and never
rewrites the old result.

## Release checklist

1. Run `npm test`, `npx tsc --noEmit --pretty false`, `npm run lint`, and
   `npm run cf:build`.
2. Apply D1 migrations with
   `npx wrangler d1 migrations apply abscissa-registry --remote --config wrangler.jsonc`.
3. Apply linked Supabase migrations with `npx supabase@latest db push --linked`.
4. Verify both migration stores are current before deploying the Worker.
5. Check the signed-out boundaries: `/api/auth/session`, `/api/team-badges/<token>`,
   and `/api/team-badge-wall/<slug>`.
6. Confirm `/api/deep-scans/health` reports `ready` after the next worker poll.
   The health signal is a runner heartbeat, so an empty queue is healthy and does
   not need a completed scan to stay green.

## Pause and rollback

Set the Cloudflare secret `TEAM_BADGE_WALL_ENABLED` to `false` and redeploy to
pause public Trust Cards without deleting or changing any badge record. Existing
direct badge tokens can be unpublished or revoked by a workspace owner/admin; the
public cache is bounded to five minutes.

The badge and delivery migrations are additive. Do not edit an applied migration
or delete badge rows during rollback. Restore the previous Worker version only
after confirming that queued delivery rows and exact public URLs are safe. Re-enable
the wall by removing the secret or setting it to any value other than `false`.

## Delivery operations

Cloudflare queues provider-specific delivery rows for Slack, generic webhooks,
Jira Cloud, or Resend email. `delivery_key` is unique for badge refreshes and
digest periods, so retrying the protected notification cron cannot duplicate a
message. Invalid or legacy targets are rejected at send time and recorded as a
retryable failure.

Weekly digests are opt-in (`weekly_digest=true`) and follow each workspace’s UTC
weekday/hour preferences. They are only generated for enabled channels and are
recorded in the workspace digest history.

Deep Scan runner heartbeats are written when the worker claims the queue, even
when no job is available. A stale heartbeat means the worker schedule or runner
credentials need attention; it does not reject new signed-in requests, which
remain queued for the next successful poll.

## Privacy boundary

Public badge and Trust Card responses contain only published release facts,
sanitized score fields, exact report links, and the explicitly requested team slug.
They do not contain members, watchlists, audit entries, scan jobs, internal IDs,
artifact hashes, or private notes. Keep this projection narrow when adding fields.
