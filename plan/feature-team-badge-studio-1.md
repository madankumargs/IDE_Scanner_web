---
goal: Team Badge Studio and retention loops
version: 1.0
date_created: 2026-09-15
last_updated: 2026-09-16
owner: GuardRails product and platform
status: Production-ready implementation; staged rollout observation pending
tags: [feature, team-workspace, badges, deep-scan, retention]
---

# Team Badge Studio and Retention Loops

![Status: Production-ready](https://img.shields.io/badge/status-Production--ready-2f7f76)

## Product direction

Make badges a team-owned trust asset rather than a one-off public generator. A signed-in team member should be able to select a watched or inventoried extension, reuse an existing completed report or request a Deep Scan, and publish a version-pinned badge with a score, scan freshness, artifact identity, and report link in a few seconds.

The retention hook is a living contract: the badge tells engineers which exact release is trusted, tells security when a new release changes the risk picture, and turns the next release into a useful return visit. The product should earn repeat use through meaningful release-driven work—freshness, drift, evidence, review, and sharing—not through arbitrary notifications or a badge that silently changes underneath a README.

## Implementation snapshot

The workspace now contains the production-ready exact-release implementation plus release-health and retention loops: team-owned badge records have additive D1 and Supabase schemas, authenticated list/create/detail/publish/revoke/export APIs, a sessionless sanitized SVG projection, a privacy-safe Trust Card, and a Badge Studio destination in the team workspace. The implementation uses Cloudflare sessions as the primary path and retains Supabase session compatibility. Pending scans reconcile from immutable reports, exact report reuse is deduplicated, retried callbacks converge on one immutable report, release freshness marks old badges stale without mutation, capability/score deltas explain changes, opt-in digests and provider-safe delivery are idempotent, role-aware limits protect scan capacity, and audit/history/export surfaces are included. The D1 and Supabase migrations are applied; the additive delivery key and capability fields are live in production; the Worker rollout and browser evidence are tracked below.

### Production release gate

The feature is considered released only when every gate below has an evidence link or command result. A local build or a Wrangler dry-run is not a production deployment.

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Repository checks | `npm test`, `npx tsc --noEmit`, lint, and `npm run cf:build` pass | Final gate is run after the provider-delivery hardening; public corpus remains required |
| D1 rollout | `npx wrangler d1 migrations apply abscissa-registry --remote` completes, including `0008_team_badges.sql`, `0009_team_badge_operational_fields.sql`, and `0010_notification_delivery_keys.sql` | Applied remotely; migration list and live `PRAGMA table_info` verification are up to date |
| Supabase compatibility rollout | Linked Supabase project applies the team badge schema and additive operational-field migration | Applied to linked project `kmdujtabqaxgoeltbxpq`; dry-run reports remote database up to date |
| Worker rollout | `npx wrangler deploy --config wrangler.jsonc` succeeds and the deployed version exposes the `ABSCISSA_REGISTRY` binding | Final production deploy evidence is recorded after the release commit |
| Authenticated smoke | Cloudflare session: workspace → Badge Studio → create/reuse → poll → copy/report; repeat with Supabase session | Cloudflare/Supabase compatibility, role, reuse, and fallback routes are covered by focused tests; live agent-browser had no reusable signed-in session, so an operator-owned authenticated pass remains the final evidence item. |
| Public boundary | Signed-out published SVG succeeds; private/revoked token returns 404; response contains no team-private fields | Live invalid team token returned 404; legacy public badge SVG returned 200 with cache headers; published/private/revoked and Trust Card privacy cases are covered by route tests. |
| Rollback readiness | Keep the prior Worker version available; exact badge URLs remain immutable; unpublish/revoke before rollback if exposure must stop | Additive migrations, immutable exact URLs, and `TEAM_BADGE_WALL_ENABLED=false` provide a reversible public-wall pause without deleting badge records. |

## Current implementation status

Strictly against the 16 task completion criteria: **14 complete, 2 partial**. The implementation includes the full exact-release workspace flow, dual-provider persistence, release drift, evidence-aware history, opt-in reminders/digests, privacy-safe publication, fleet exports, provider-safe webhook/Jira/email delivery, limits, and rollout controls. TASK-015 remains partial because this environment has no reusable signed-in Cloudflare or Supabase browser session; TASK-016 remains partial because internal-team beta observation requires an actual team and operator feedback. These are release-evidence activities, not unimplemented product paths.

## 1. Requirements & Constraints

### Functional requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| REQ-001 | Add a Badge Studio surface inside the authenticated team workspace. It must use the existing workspace session and must not send a signed-in member through the public sign-in gate. | An authorized team member can open Badge Studio from workspace navigation and sees team-aware controls immediately. |
| REQ-002 | Support an exact-release badge mode tied to extension ID, version, completed scan/report ID, and artifact SHA when available. The generated output must include the risk score, malware score or equivalent trust signal, capability summary, and report link. | Copying Markdown or HTML produces a stable badge URL that continues to identify the same release and report. |
| REQ-003 | Reuse an eligible completed report or active scan for the same extension/version/artifact before creating another scan. A team can request a new scan when no eligible report exists or when the report is stale by policy. | Repeated clicks for the same release create at most one active team badge scan and do not duplicate expensive work. |
| REQ-004 | Show badge lifecycle and freshness in the workspace: pending, ready, stale, drifted, revoked, and failed states with a clear next action. | The workspace explains whether a badge is safe to copy, needs review, or needs refreshing. |
| REQ-005 | Connect release monitoring to badge health. A newly observed release must make the existing exact badge visibly stale or drifted without mutating its historical meaning. | A release event produces an actionable refresh state and preserves the old version-pinned badge. |
| REQ-006 | Make sharing intentional and privacy-safe. Public SVG/report responses may expose only published badge data and scan-derived release facts; they must never expose team names, members, watchlists, audit entries, private notes, or internal identifiers. | A public badge request succeeds without a session and a privacy test confirms that private workspace fields are absent. |
| REQ-007 | Preserve the existing public badge builder and public badge URLs as compatibility paths. The workspace may share the underlying badge rendering and decision logic, but it must not regress public exact-version or unpinned badge behavior. | Existing public badge, version-pinned badge, signed-out gate, and Supabase-authenticated flows remain green. |
| REQ-008 | Give the team a useful history: who created or refreshed a badge, which release it represents, when it was scanned, and what changed since the prior monitored release. | Activity and badge detail views can answer why a badge changed and what a reviewer should do next. |

### Security and authorization requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| SEC-001 | Use Cloudflare session authentication as the primary browser path through `lib/browserAuth`, with Supabase session headers retained as a compatibility path. | Requests authenticated by either supported browser session reach the same authorized workspace behavior. |
| SEC-002 | Enforce team membership and role checks server-side for every team badge read and write. Owners/admins/analysts can create or refresh; viewers can view and copy; publishing or revoking a public badge is restricted to owners/admins unless product policy explicitly widens it. | Direct API calls cannot bypass the workspace UI or escalate a viewer into a write operation. |
| SEC-003 | Bind scan access and progress to the requesting team and authorized member. Do not make private scan progress discoverable through a public badge token. | An unrelated member cannot read team scan status, and a public request cannot retrieve private job metadata. |

### Product and technical constraints

| ID | Constraint | Consequence |
| --- | --- | --- |
| CON-001 | The current badge output is publicly embeddable in README files and must remain cacheable and fetchable without authentication. | Public rendering needs a scrubbed, immutable projection rather than a workspace API response. |
| CON-002 | The repository supports Cloudflare/D1 state and Supabase compatibility. | New persistence and route behavior require both adapters or a clearly isolated compatibility fallback. |
| CON-003 | Existing Deep Scan jobs and immutable reports are the canonical source for scan progress and exact release evidence. | Team badges should link to or reference those reports, not invent a second scan-result model. |
| CON-004 | The first release should fit the current workspace information architecture and avoid introducing a separate team product shell. | Add one primary workspace destination and small Overview/Extensions health affordances before considering a standalone Trust Center. |
| GUD-001 | Treat exact-release and live-monitoring badges as different promises. | Exact badges never silently change; live badges must visibly say that they represent the latest monitored state. |
| GUD-002 | Every return loop must be tied to a user benefit: a new release, a score change, a stale report, a review decision, or a shareable artifact. | Avoid notification spam and vanity engagement metrics. |
| GUD-003 | Keep the first-run path fast and informative. | Preselect a watched extension, explain scan reuse, preview the score, and show copyable snippets in one focused flow. |

## 2. Implementation Steps

### Phase 1: Team Badge Studio foundation and exact-release MVP

**Goal: GOAL-001 — A signed-in team can create and share a trustworthy badge for a monitored release.**

| ID | Task | Files / scope | Depends on | Completion criteria | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | Define the badge domain contract and state machine. Model exact-release versus live-monitoring mode, eligibility, freshness, stale/drifted transitions, publish/revoke transitions, and scan deduplication keys. | New `lib/teamBadges.ts`; pure functions and types | Existing badge decision and deep-scan types | Domain tests cover valid transitions, invalid transitions, same-artifact reuse, and a release event that does not rewrite historical identity. | Complete |
| TASK-002 | Add persistence for team-owned badge records in D1 and Supabase. Store team ID, extension ID, version, scan/report linkage, artifact SHA, mode, visibility, public token or slug, status, creator, timestamps, and revocation fields. Add team/extension/status indexes and RLS/policy coverage. | Team badge migrations plus focused persistence adapters | Team state schema, existing membership helpers | Both stores create, list, update, revoke, and retain capability evidence; remote migrations are applied and verified. | Complete |
| TASK-003 | Extract reusable badge presentation and snippet generation from the public builder. Keep the current public builder’s behavior, but share preview, score display, exact-version identity, Markdown/HTML copy, report link, and error/loading states with workspace Badge Studio. | `app/badge/BadgeBuilder.tsx`; `lib/badgeSnippets.ts` | Existing `browserAuthHeaders`, public badge route contract | Public and workspace paths use the same exact-release Markdown/HTML generators and focused compatibility tests pass. | Complete |
| TASK-004 | Implement team badge APIs. Add list/create/detail/update-or-revoke routes with `authenticated`, `requireTeamRole`, input validation, audit events, and Cloudflare-first/Supabase-compatible storage. Create requests should reuse an active/completed exact report or enqueue a team-associated Deep Scan with `scan_purpose = team_badge`. | New `app/api/teams/[id]/badges/route.ts`; new `app/api/teams/[id]/badges/[badgeId]/route.ts`; deep-scan linkage updates | Badge domain contract, persistence adapter, existing `/api/deep-scans` lifecycle | Authorized Cloudflare and Supabase requests behave consistently; duplicate requests converge on one badge/scan; unauthorized roles receive the existing error shape. | Complete |
| TASK-005 | Add the workspace Badge Studio view and entry point. Include watched/inventory extension selection, release/version selection, scan reuse explanation, progress, scored preview, copy controls, report link, badge list, and role-appropriate actions. | `app/TeamWorkspace.tsx`; new `app/workspace/views/BadgeStudioView.tsx`; new `app/workspace/badgeStudio.module.css`; possibly workspace types/styles | Shared badge presentation, team badge API, existing workspace `getAuthHeaders` | A team member can navigate Overview → Badge Studio, create or reuse a scan, wait for readiness, and copy a badge without leaving workspace. | Complete |
| TASK-006 | Instrument and audit the core journey without collecting sensitive IDs. Add aggregate product events for studio opened, scan requested, badge created, copied, report opened, and refresh intent. | `lib/analyticsEvents.ts`; existing analytics/audit helpers | Existing `trackProductEvent`, team audit history | Events contain route, mode, role-safe category, and outcome only; audit history identifies actor and action internally. | Complete |

Phase 1 success criteria: an already signed-in owner, analyst, or viewer can reach the right control surface according to role; an exact badge is backed by a completed immutable report; no duplicate scan is created for the same artifact; and public badge requests remain sessionless and privacy-safe.

### Phase 2: Release-driven return loops and team visibility

**Goal: GOAL-002 — Teams return because Badge Studio surfaces meaningful release changes and review work.**

| ID | Task | Files / scope | Depends on | Completion criteria | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-007 | Add Badge Health to Overview and Extensions. Show ready/current, pending, stale, drifted, failed, and uncovered watched extensions; include “refresh” and “create badge” actions. | `app/TeamWorkspace.tsx`; workspace views/types/styles | Phase 1 badge list; existing watchlist and overview data | Overview and Extensions show coverage, stale/failed states, and next actions. | Complete |
| TASK-008 | Connect release event ingestion to badge state. On a new observed release, mark exact badges as drifted/stale, preserve the old badge, and offer a one-click scan/refresh for the new version. | Catalog watcher, Cloudflare reconciliation, `lib/teamBadges.ts`, badge API | Existing `release_events`, `ReleaseEventQueue`, watchlist baseline logic | Both providers mark exact badges stale idempotently and preserve the old public identity. | Complete |
| TASK-009 | Add evidence-aware change summaries to badge detail and Activity. Reuse scan report facts and existing evidence/decision surfaces to show changed capabilities, score delta, or review status. | Badge insights helper, Badge Studio, workspace Activity | Existing report JSON, activity/audit data, Phase 2 drift state | Badge cards and activity explain score/capability changes and link to exact evidence. | Complete |
| TASK-010 | Add a weekly digest and in-product reminders only for high-signal badge events: new release, score change, failed refresh, or badge nearing staleness. Respect existing workspace preferences and delivery channels. | Cloudflare digest queue, notification delivery adapter, existing Supabase digest | Existing team digest, channels, deliveries, notification preferences | Digest/reminder delivery is opt-in, provider-correct, deduplicated, retryable, auditable, and suppressible. | Complete |
| TASK-011 | Add explicit public publishing controls and a lightweight public Trust Card/Badge Wall experiment. Allow a team to choose which exact badges are public, preview the sanitized output, revoke publication, and link back to public reports. | Team badge public SVG, Trust Card wall, Badge Studio controls | Privacy projection, role checks, badge history | Public pages contain only published exact-release facts; team-private fields and names are excluded. | Complete |

Phase 2 success criteria: a release event creates useful review work, a team can refresh without losing the old trust claim, Overview makes coverage visible, and reminders are tied to material changes.

### Phase 3: Shareable team assets and expansion

**Goal: GOAL-003 — Badge usage becomes part of the team’s normal engineering workflow.**

| ID | Task | Files / scope | Depends on | Completion criteria | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-012 | Add fleet-level export for selected inventory/watchlist items: Markdown badge snippets, a `GUARDRAILS.md` trust inventory, and JSON for automation. | Team badge export endpoint and Badge Studio export UI | Stable badge records and privacy rules | A team can download repeatable repository trust artifacts with exact release identity preserved. | Complete |
| TASK-013 | Add optional PR/status-check and webhook integrations using existing notification/channel primitives. Start with a release-change summary and badge refresh recommendation rather than automatic public publishing. | Existing channel settings plus Cloudflare provider adapter | Phase 2 event model; existing team API/integration patterns | Generic webhook, Slack, Jira, and email deliveries are opt-in, replay-safe, scoped to a team, and scrubbed. | Complete |
| TASK-014 | Add usage limits, scan budget protections, and entitlement hooks. Make repeated refresh requests safe and explain limits in the UI. | Badge admission checks, limits helper, stable team API errors | Current plan/billing model and scan lifecycle | Durable badge and active-scan limits return actionable 429 responses and prevent unbounded loops in both stores. | Complete |

Phase 3 success criteria: teams can maintain a trust artifact in repositories or CI, receive release context where they already work, and understand the cost/limits of refresh operations.

### Phase 4: Validation and launch

**Goal: GOAL-004 — The feature is safe, understandable, measurable, and ready for a staged rollout.**

| ID | Task | Files / scope | Depends on | Completion criteria | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-015 | Run accessibility, responsive, performance, and browser dogfood checks across signed-in Cloudflare and Supabase sessions. Verify public badge caching and signed-out boundaries. | UI and route tests; agent-browser smoke script/checklist | Phases 1–3 as released | Automated accessibility/type/build gates and public/signed-out boundaries pass; authenticated browser evidence awaits a reusable operator session. | Partial |
| TASK-016 | Add rollout instrumentation, migration verification, rollback procedures, and a small internal-team beta. Review metrics and qualitative feedback before enabling public publishing broadly. | Release checklist; migration/rollback notes; `TEAM_BADGE_WALL_ENABLED` kill switch | Analytics, audit, feature flag/config conventions | Rollout can be paused without orphaning badge records or mutating public exact-release URLs; internal beta observation remains operator-owned. | Partial |

## 3. Alternatives

| ID | Alternative | Decision |
| --- | --- | --- |
| ALT-001 | Embed the current public `/badge` builder inside workspace. | Reject as the primary design. It repeats the generic public flow, loses team ownership/history, cannot explain coverage or drift, and makes permissions awkward. Reuse its rendering primitives instead. |
| ALT-002 | Ship only a dynamic “latest release” badge. | Reject for the first mode. A dynamic badge can silently change after a release and undermines the trust claim in a README. Add it later only as an explicitly labeled live-monitoring mode. |
| ALT-003 | Keep badges entirely private to the workspace. | Reject as the product direction. Private status is useful, but shareable badges are the acquisition and advocacy loop. Make publication explicit and sanitize the public projection. |
| ALT-004 | Scan every refresh request independently. | Reject. Reuse active/completed reports for the same artifact and make scan association idempotent to protect latency, cost, and runner capacity. |
| ALT-005 | Build a standalone public Trust Center before workspace workflow. | Defer. First prove that teams create, review, refresh, and copy badges from the signed-in workspace; then promote proven badge collections into a public surface. |

## 4. Dependencies

| ID | Dependency | How it is used |
| --- | --- | --- |
| DEP-001 | `lib/browserAuth.ts` and the existing `browserAuthHeaders`/workspace `getAuthHeaders` pattern | Cloudflare-first browser authentication with Supabase compatibility. |
| DEP-002 | `app/api/deep-scans`, `app/api/deep-scans/[id]`, `lib/cloudflareDeepScan.ts`, and D1 scan/report tables | Scan admission, progress, deduplication, and immutable exact-release evidence. |
| DEP-003 | `lib/teams.ts`, `requireTeamRole`, team membership tables, and workspace state | Server-side authorization and Cloudflare/Supabase team access. |
| DEP-004 | Watchlist, inventory, release-event queue, baseline, and activity/audit surfaces | Extension selection, coverage, drift detection, and explainable history. |
| DEP-005 | Existing badge routes, `lib/productData.ts`, trust-tier helpers, and SVG rendering | Public compatibility and shared score/identity semantics. |
| DEP-006 | Existing digest, channel, delivery, and workspace preference systems | High-signal return loops without creating a parallel notification framework. |
| DEP-007 | `lib/analyticsEvents.ts` and current product analytics | Aggregate funnel/retention measurement without extension IDs, reports, hashes, users, or emails. |
| DEP-008 | D1 and Supabase migration/deployment processes | Dual-store schema rollout, verification, and safe rollback. |

## 5. Files

| ID | File or area | Change |
| --- | --- | --- |
| FILE-001 | `app/TeamWorkspace.tsx` | Add the Badge Studio view, navigation, data loading, and shared authenticated request path. |
| FILE-002 | `app/workspace/views/BadgeStudioView.tsx` | New signed-in team flow for selecting releases, requesting/reusing scans, previewing, copying, publishing, and refreshing badges. |
| FILE-003 | `app/workspace/badgeStudio.module.css` | New responsive/accessibility-conscious workspace styling. |
| FILE-004 | `app/badge/BadgeBuilder.tsx` plus new shared badge components | Preserve public behavior while extracting reusable preview/snippet/status presentation. |
| FILE-005 | `lib/teamBadges.ts` | New domain types, state transitions, freshness, eligibility, and idempotency logic. |
| FILE-006 | `app/api/teams/[id]/badges/route.ts` and `[badgeId]/route.ts` | New authenticated team badge list/create/detail/mutate endpoints. |
| FILE-007 | `app/api/team-badges/[token].svg/route.ts` or the repository’s chosen canonical public route | New sanitized public team badge projection, if Phase 2 publishing is enabled. |
| FILE-008 | `lib/cloudflareWorkspace.ts` and team/Supabase adapters | Persist badge records, project public data, and keep compatibility behavior aligned. |
| FILE-009 | `d1/migrations/0008_team_badges.sql` | D1 schema and indexes for team badge records. |
| FILE-010 | `supabase/migrations/20260915160000_team_badges.sql` | Supabase schema, RLS, and policies for compatibility. |
| FILE-011 | `lib/analyticsEvents.ts` and existing audit helpers | Add safe aggregate events and internal badge audit actions. |
| FILE-012 | Release-event, digest, activity, inventory, and settings surfaces | Add drift, reminder, evidence-history, coverage, and preference integrations in later phases. |

## 6. Testing

| ID | Test | Coverage |
| --- | --- | --- |
| TEST-001 | Domain unit tests for `lib/teamBadges.ts` | Exact-release identity, mode-specific semantics, lifecycle transitions, staleness, publish/revoke rules, and idempotent keys. |
| TEST-002 | Team badge API route tests | Cloudflare session success, Supabase session compatibility, missing/expired session, role matrix, team isolation, validation, and stable error responses. |
| TEST-003 | Scan reuse and association tests | Reuse completed report, join active job, create only when necessary, persist scan/report linkage, and update ready/failed states. |
| TEST-004 | Workspace surface tests | Badge Studio navigation, preselected watched extension, no unnecessary sign-in gate, pending/ready/error states, viewer controls, and copy actions. |
| TEST-005 | Shared badge rendering tests | Exact version, artifact identity, risk/malware score, capability summary, report URL, Markdown/HTML output, and compatibility with existing public builder tests. |
| TEST-006 | Release drift integration tests | New release marks an exact badge stale/drifted, preserves the old badge, creates one refresh opportunity, and does not silently alter public SVG output. |
| TEST-007 | Public privacy and route tests | Unauthenticated published badge succeeds; unpublished/revoked badge behavior is correct; responses exclude team-private fields and private scan progress. |
| TEST-008 | D1/Supabase persistence and RLS tests | Migration shape, indexes, membership isolation, role policies, and parity of list/create/revoke semantics. |
| TEST-009 | Analytics and audit tests | Event payloads contain only approved aggregate fields; actor/action audit entries are present and deduplicated. |
| TEST-010 | End-to-end browser smoke flow | Signed-in Cloudflare path: workspace → Badge Studio → select watched extension → reuse/request scan → poll → copy/open report. Repeat with Supabase compatibility session and verify signed-out public boundary. |
| TEST-011 | Accessibility, responsive, and performance checks | Keyboard navigation, labels/live progress, mobile layout, no avoidable auth flicker, and bounded requests during polling/refresh. |
| TEST-012 | Full regression suite and production verification | Existing public badge, Deep Scan, account header, workspace activity, release queue, invitations, and all current tests remain green. |

## 7. Risks & Assumptions

### Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-001 | Dynamic status becomes misleading when a monitored release changes. | Keep exact-release immutable; label live-monitoring separately; show version, last checked time, and report link in every dynamic output. |
| RISK-002 | Badge Studio creates expensive duplicate scans or a refresh loop. | Use artifact-level idempotency, active-job joining, server-side admission checks, rate limits, and visible scan state. |
| RISK-003 | Public sharing leaks team-private context. | Build a narrow public projection, allow explicit publication, test forbidden fields, and never use team workspace responses for SVG rendering. |
| RISK-004 | Cloudflare and Supabase data diverge during rollout. | Keep adapters behind the same domain contract, test both paths, record migration version, and provide reconciliation/rollback notes. |
| RISK-005 | Users ignore another dashboard notification. | Trigger reminders only for release/score/review changes, consolidate into existing digests, and measure actions rather than sends. |
| RISK-006 | Scan runner delay makes the feature feel broken. | Show queue/analyzing progress, preserve the workspace context, allow navigation back to the pending badge, and reuse existing job progress/error semantics. |
| RISK-007 | A public Trust Card expands scope before the core workflow proves value. | Gate it behind Phase 2 validation and a feature flag; launch the exact badge workflow first. |

### Assumptions

| ID | Assumption | Validation |
| --- | --- | --- |
| ASSUMPTION-001 | Team members are already signed in when they use the workspace, so Badge Studio should optimize for zero extra auth friction. | Browser smoke tests cover Cloudflare-first and Supabase compatibility sessions. |
| ASSUMPTION-002 | Existing immutable scan reports are sufficient to support score, malware, capability, and exact artifact claims. | Confirm report JSON fields and artifact SHA availability before schema/API implementation. |
| ASSUMPTION-003 | The desired badge is useful outside the workspace, including README and PR contexts, but publication must be explicit. | Validate with a small internal-team beta and review public projection fields. |
| ASSUMPTION-004 | Initial retention targets are experiments, not existing product facts. | Establish a baseline during the beta and adjust targets from observed team behavior. |
| ASSUMPTION-005 | The release event queue and workspace digest infrastructure can emit badge-related work without a new delivery system. | Verify event payloads and delivery contracts during Phase 2 spike. |

## 8. Related Specifications / Further Reading

- `app/badge/BadgeBuilder.tsx` — current public badge creation, sign-in gate, Deep Scan polling, score display, and copy formats.
- `app/api/badge/route.ts` and `app/api/badge/[...slug]/route.ts` — current public unpinned and version-pinned badge contracts.
- `lib/productData.ts` — badge decision lookup, score/trust semantics, and Cloudflare/Supabase fallback behavior.
- `lib/browserAuth.ts` — Cloudflare-first browser session headers with Supabase compatibility.
- `app/TeamWorkspace.tsx` and `app/workspace/views/ActivityView.tsx` — current team workspace information architecture and activity surface.
- `app/api/teams/[id]/watchlist/route.ts` and `lib/teams.ts` — team authentication, role authorization, and watchlist patterns.
- `lib/cloudflareWorkspace.ts` — Cloudflare workspace state, release events, audit, deliveries, and team-owned data patterns.
- `app/api/deep-scans/route.ts`, `app/api/deep-scans/[id]/route.ts`, and `lib/cloudflareDeepScan.ts` — current scan lifecycle and progress model.
- `d1/migrations/0003_private_guardrails.sql` — D1 users, sessions, teams, team state, scan jobs, and immutable scan reports.
- `supabase/migrations/20260804090000_add_team_monitoring_baselines.sql`, `20260804100000_add_team_release_events.sql`, and `20260806180000_unified_team_audit_history.sql` — existing team monitoring and history data model.
- `lib/analyticsEvents.ts` — current privacy-safe product event conventions.

## Product measurement targets

These are initial beta hypotheses to validate, not commitments based on existing telemetry:

- 35% of active teams create their first badge within seven days of Badge Studio availability.
- 50% of teams that create a badge return to Badge Studio within fourteen days.
- 25% of badge-creating teams cover at least two watched or inventoried extensions.
- 60% of ready exact badges are copied, opened, or exported.
- Fewer than 1% of exact-artifact requests create duplicate active scan jobs.
- Zero tested public badge responses contain team-private metadata.

The launch decision should use these measures together with qualitative feedback: whether teams understand exact versus live badges, whether release changes feel actionable, and whether the exported artifact is useful in real repositories.
