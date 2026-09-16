---
goal: Replace generic AI explanations with concise reviewer guidance for exact extension releases
version: 2.0
date_created: 2026-09-15
last_updated: 2026-09-16
owner: GuardRails
status: In Progress
tags: [feature, ai, security-review, ux, sarvam]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-4c9aff)

The current report repeats deterministic scan facts in long AI-written sections. This plan replaces that experience with a short, decision-oriented reviewer guide: one important takeaway, the evidence-backed event chain that makes it relevant, the practical consequence for the reviewer, and the smallest set of actions or unknowns that remain. Deterministic scan output remains authoritative and is rendered separately as proof.

## 1. Requirements & Constraints

- **REQ-001**: The first screen of a generated guide must answer “What do I need to know?” and “What should I do next?” for the selected review goal.
- **REQ-002**: The guide must explain a causal event chain only when the supplied report contains enough evidence to identify a trigger, action, target, or consequence. It must say that the chain is unavailable when those elements are missing.
- **REQ-003**: The generated guide must contain no more than one primary takeaway, three secondary insights, three actions, and three unknowns.
- **REQ-004**: Every generated insight and action must cite exact evidence references from the signed report context. The UI must make those references expandable or linkable to the corresponding deterministic evidence.
- **REQ-005**: The guide must distinguish `observed`, `bounded_inference`, and `unknown` at the claim level. It must never convert a capability into intent, compromise, exploitability, probability, or confirmed harm.
- **REQ-006**: The guide must support three user jobs rather than generic audiences: decide whether to install, investigate a flagged release, and respond as a publisher.
- **REQ-007**: The output must prioritize release-specific changes and actionable consequences. It must not restate the full capability list, scan metadata, or policy decision in multiple sections.
- **REQ-008**: Visuals must be rendered by application components from validated structured data. Sarvam must not generate HTML, Markdown, SVG, CSS, diagrams, or layout instructions.
- **REQ-009**: If AI output is unavailable or invalid, the exact deterministic report must remain usable and the UI must show a short labelled fallback state; it must not display unvalidated provider text.
- **SEC-001**: The existing server-only Sarvam secret, signed exact-context ticket, redaction, request-size limit, same-origin check, authentication, shared D1 rate limit, timeout, kill switch, and no-store response policy must remain enabled.
- **SEC-002**: The model must receive only bounded structured report facts and normalized evidence references. Raw source, README text, credentials, advisory payloads, hidden reasoning, and unrelated account data remain excluded.
- **SEC-003**: The validator must reject foreign references, unsupported security assertions, deterministic-decision mutations, duplicate claim IDs, excessive narrative length, and repeated copies of the same primary conclusion.
- **CON-001**: The current deterministic scan schema and exact-artifact identity must remain backward-compatible for existing reports.
- **CON-002**: The standard production model remains `sarvam-105b`; beta model overrides remain operator-only and must not be exposed as a user choice.
- **CON-003**: The output must remain a structured JSON contract so the UI controls typography, hierarchy, citations, responsive layout, print output, and accessibility.
- **GUD-001**: Prefer concrete verbs and report-specific nouns over security boilerplate such as “this report provides valuable insights” or repeated “potential blast radius” explanations.
- **GUD-002**: Put detail behind evidence disclosures. The default view should be scannable in under one minute, with enough proof available for a security reviewer who wants to verify it.
- **PAT-001**: Treat deterministic scan facts as proof and AI output as a bounded interpretation layer; never allow AI text to become a second source of truth.
- **PAT-002**: Use a single primary decision-support card followed by compact causal, action, and unknown sections; do not render a sequence of similarly weighted essay sections.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Define a concise, user-job-oriented response contract and remove narrative duplication.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | In `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.ts`, replace the current `IntelligenceNarrativeDraft` fields `headline`, `bottom_line`, and broad claim buckets with a bounded `ReviewerGuideDraft` containing `primary_takeaway`, `event_chain`, `scenarios`, `release_changes`, `next_actions`, and `unknowns`; define max item and character limits in one constant block. | Yes | 2026-09-15 |
| TASK-002 | In `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.ts`, update `INTELLIGENCE_RESPONSE_SCHEMA` and `createEvidenceIntelligenceReport` so the model returns only the new structured guide; include the selected `review_goal` (`install_decision`, `flag_investigation`, or `publisher_response`) and require each object to carry certainty and exact evidence references. | Yes | 2026-09-15 |
| TASK-003 | In `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.ts`, replace the essay-oriented system prompt with explicit anti-duplication rules: one takeaway, no restatement of deterministic metadata, no generic security prose, no claims without a causal path, no invented release change, and no action that is not tied to a supplied unknown or evidence-backed risk. | Yes | 2026-09-15 |
| TASK-004 | In `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.ts`, add validation for total narrative length, repeated normalized sentences, repeated decision rationale, unsupported causal chains, missing evidence on material objects, and invalid `review_goal` output; preserve the existing foreign-reference and overclaim checks. | Yes | 2026-09-15 |

### Implementation Phase 2

- GOAL-002: Rebuild the report surface around reviewer decisions and attention.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, replace the `Review lens` selector with a `Review goal` selector using the three user jobs, and submit that goal to the intelligence route. Keep the exact release identity and deterministic decision in a compact, non-AI status rail. | Yes | 2026-09-15 |
| TASK-006 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, render a single “What you need to know” card with the primary takeaway, one next action, certainty badge, and cited evidence. Render only the sections that contain useful content; do not render empty or generic headings. | Yes | 2026-09-15 |
| TASK-007 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, render `event_chain` as “Trigger → action → target → possible consequence” only when validated nodes exist. Render `scenarios` as compact cards with `when`, `what happens`, `what could be affected`, and `what is not established`; prevent the scenario cards from repeating the primary takeaway. | Yes | 2026-09-15 |
| TASK-008 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, render release changes as a focused before/after block when `release_delta.available` is true; when unavailable, show one compact “No comparable release evidence was supplied” notice instead of a generated paragraph. | Yes | 2026-09-15 |
| TASK-009 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, render next actions by owner (`you`, `security team`, or `publisher`) and show unknowns as questions a reviewer can answer. Move the full evidence catalog and deterministic details behind disclosure controls or the existing report anchors. | Yes | 2026-09-15 |
| TASK-010 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceVisuals.tsx` and `/home/akprajwal/VScode/ide-scanner-web/app/evidenceIntelligence.module.css`, replace the broad generic flow map with a compact validated event-chain visual and a severity-by-dimension matrix only when each visual has at least two meaningful data points; ensure mobile and print layouts remain readable. | Yes | 2026-09-15 |

### Implementation Phase 3

- GOAL-003: Make the system helpful even when the model is unavailable while preserving honesty.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-011 | In `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.ts`, implement `buildDeterministicReviewFallback` that produces a short labelled fallback from deterministic decision, access surface, release delta, coverage boundaries, and exact evidence refs; it must not use provider text or add inferences. | Yes | 2026-09-15 |
| TASK-012 | In `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`, show the fallback only for provider timeout, unavailable, or invalid-output states, label it as “Deterministic review summary — AI interpretation unavailable,” and preserve the generate control for a later retry subject to the existing quota. | Yes | 2026-09-15 |
| TASK-013 | In `/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.ts`, keep the signed context verification path and rate limit unchanged while adding the validated `review_goal` input; reject unsupported goals before consuming a provider request. | Yes | 2026-09-15 |

### Implementation Phase 4

- GOAL-004: Prove that the new experience is concise, grounded, and useful for each reviewer job.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | Extend `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.test.ts` with fixtures for a download-and-execute chain, a capability-only report, a release with no baseline, an unclassified capability, and a report with missing trigger data; assert concise output, exact refs, correct certainty, and no unsupported scenario. | Yes | 2026-09-15 |
| TASK-015 | Extend `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.test.ts` with schema fixtures for all three review goals, duplicate-conclusion rejection, causal-chain omission, length caps, and hidden reasoning exclusion. | Yes | 2026-09-15 |
| TASK-016 | Extend `/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.test.ts` with invalid review-goal, signed-ticket, auth, same-origin, body-size, kill-switch, rate-limit, and provider-failure cases. | Yes | 2026-09-15 |
| TASK-017 | Add or update `/home/akprajwal/VScode/ide-scanner-web/app/evidenceIntelligenceSurface.test.ts` to assert that the default view has one primary takeaway, no generic essay headings, visible citations, accessible certainty labels, and deterministic fallback copy. | Yes | 2026-09-15 |
| TASK-018 | Run focused Vitest tests, `npx tsc --noEmit`, ESLint, production build, and authenticated in-app browser checks for all three review goals; verify that generated copy is concise, references exact evidence, and does not alter the deterministic decision. | In progress | 2026-09-16 |

### Implementation Phase 5

- GOAL-005: Make every user-facing surface describe the same evidence-first review workflow.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Audit public marketing, trust, registry, workspace, monitoring, and report-library copy for generic AI framing or claims that no longer match the reviewer-guide contract. Replace confirmed cases with release-, evidence-, ownership-, and boundary-specific language. | Yes | 2026-09-16 |
| TASK-020 | Align the Sarvam program note and About page with the shipped reviewer-guide behavior: three review jobs, exact evidence citations, deterministic decisions, causal-chain refusal, and usable fallback behavior. | Yes | 2026-09-16 |
| TASK-021 | Add `/home/akprajwal/VScode/ide-scanner-web/app/genericCopySurface.test.ts` as a copy regression check for retired generic phrases and required reviewer-guide language on audited surfaces. | Yes | 2026-09-16 |
| TASK-022 | Retire the unused essay-shaped `/brief` endpoint and compatibility component with an explicit 410 migration response to `/intelligence`, so a second unvalidated AI contract cannot remain reachable. | Yes | 2026-09-16 |

**Verification note (2026-09-16):** Web CI and the Cloudflare Worker deployment are green through commit `17d4582` (including the bounded Sarvam repair path, TypeScript, focused Vitest tests, production build, D1 migration step, and Cloudflare deploy). The exact production report was opened in the authenticated in-app browser and generated against `Dart-Code.dart-code@3.141.20260803`. Sarvam returned HTTP 200 from `sarvam-105b` without refusal or hidden reasoning; after one bounded category-level repair, the live UI displayed `Sarvam reviewer guide · evidence validated` with release-specific copy, exact evidence links, an explicit unavailable causal-chain state, conditional impact language, and a concrete manual-review action. The deterministic `BLOCK` decision and exact-artifact proof rail remained unchanged. TASK-018 remains in progress only for the remaining authenticated checks across the other two review goals, while invalid provider output still falls back safely. The working tree also contains unrelated concurrent Badge Studio changes, which were preserved and not included in these commits.

## 3. Alternatives

- **ALT-001**: Keep the current long-form narrative and improve the prompt only. Rejected because the UI contract itself encourages repeated prose and treats every section as equally important.
- **ALT-002**: Remove AI and show only deterministic facts. Rejected because reviewers still need help connecting evidence to a practical decision and identifying the next verification step.
- **ALT-003**: Ask the model to generate a Markdown report or diagram. Rejected because provider formatting is inconsistent, difficult to validate, and would weaken accessibility and layout control.
- **ALT-004**: Add more numeric risk scores. Rejected because scores would create false precision and do not answer what a user should do with this exact release.

## 4. Dependencies

- **DEP-001**: Existing Sarvam `sarvam-105b` structured JSON endpoint and server-only `SARVAM_API_KEY` secret.
- **DEP-002**: Existing `app_ai_usage` D1 table and shared three-request-per-ten-minute production quota.
- **DEP-003**: Existing signed evidence context ticket and exact scan identity validation.
- **DEP-004**: Existing Next.js route/component structure and CSS module styling.

## 5. Files

- **FILE-001**: `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.ts` — new reviewer-guide types, bounded compiler, fallback, repetition checks, and validator.
- **FILE-002**: `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.ts` — goal-aware prompt, structured response schema, and provider parsing.
- **FILE-003**: `/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.ts` — request validation for review goals and existing guardrails.
- **FILE-004**: `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx` — decision-oriented report surface and fallback state.
- **FILE-005**: `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceVisuals.tsx` — compact validated causal-chain and impact visuals.
- **FILE-006**: `/home/akprajwal/VScode/ide-scanner-web/app/evidenceIntelligence.module.css` — scannable, responsive, print-safe visual hierarchy.
- **FILE-007**: `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.test.ts` — compiler and validator coverage.
- **FILE-008**: `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.test.ts` — provider/schema/prompt safety coverage.
- **FILE-009**: `/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.test.ts` — route guardrail coverage.
- **FILE-010**: `/home/akprajwal/VScode/ide-scanner-web/app/evidenceIntelligenceSurface.test.ts` — user-facing structure and accessibility assertions.

## 6. Testing

- **TEST-001**: A valid flagged release produces exactly one primary takeaway, at most three scenarios/actions/unknowns, and no repeated decision rationale.
- **TEST-002**: A capability-only release does not produce a causal event chain, intent claim, exploitability claim, or unsupported consequence.
- **TEST-003**: Every material object in the provider response resolves to an exact catalog reference after alias normalization; foreign and ambiguous refs fail closed.
- **TEST-004**: Missing release baseline produces a compact deterministic notice and no invented “what changed” narrative.
- **TEST-005**: Provider timeout, non-JSON, refusal, or schema failure produces only the labelled deterministic fallback and never renders raw provider text.
- **TEST-006**: Each review goal changes the action framing while preserving the same exact-artifact identity, deterministic decision, evidence refs, and security limitations.
- **TEST-007**: Browser verification confirms concise first-screen content, accessible certainty labels, visible evidence links, responsive visuals, print output, and no console errors.

## 7. Risks & Assumptions

- **RISK-001**: Sarvam may still return semantically repetitive or generic text even when its JSON shape is valid; repetition checks and strict length caps must fail or fall back rather than display it.
- **RISK-002**: The scanner may not provide enough causal evidence for a useful event chain; the UI must make that absence explicit without implying safety.
- **RISK-003**: Reviewers may mistake bounded inference for confirmed harm; certainty labels, wording constraints, and distinct visual treatment must remain prominent.
- **RISK-004**: A fallback can become a second long deterministic report; keep the fallback to one takeaway and three actions maximum.
- **ASSUMPTION-001**: The primary users are individual developers, security reviewers, and extension publishers who need an install/approval decision rather than a general AI summary.
- **ASSUMPTION-002**: Existing exact-report anchors can support evidence citation links without exposing additional raw source content.
- **ASSUMPTION-003**: Standard generation latency may remain approximately provider-dependent; the first screen must still be useful while generation is loading and after a provider failure.

## 8. Related Specifications / Further Reading

- `/home/akprajwal/VScode/ide-scanner-web/plan/feature-evidence-intelligence-report-1.md`
- `/home/akprajwal/VScode/ide-scanner-web/lib/evidenceIntelligence.ts`
- `/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.ts`
- `/home/akprajwal/VScode/ide-scanner-web/app/EvidenceIntelligenceReport.tsx`
