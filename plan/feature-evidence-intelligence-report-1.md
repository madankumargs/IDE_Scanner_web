---
goal: Build an evidence-grounded AI security intelligence report for exact extension releases
version: 1.0
date_created: 2026-09-15
last_updated: 2026-09-15
owner: Abscissa / GuardRails
status: In Progress
tags: [security-intelligence, evidence-grounding, blast-radius, sarvam, exact-artifact]
---

# Introduction

GuardRails already provides the most important primitive: an immutable report for one exact extension artifact, with deterministic findings, capabilities, dependencies, files, coverage, provenance, and a release decision. The next feature should turn that evidence into a high-quality security intelligence report that a security lead, engineer, or publisher can actually use.

The feature is not a chatbot and does not replace the scanner. A server-side evidence compiler will first normalize the complete structured report into a typed, bounded evidence graph. Deterministic code will calculate the access surface and blast-radius dimensions. Sarvam will then write a constrained narrative over that graph, returning claim-level evidence references, explicit uncertainty, and a small visual specification. A validator will reject unsupported or malformed output before anything reaches the user.

The report will answer:

- What exact release was analyzed?
- What can the extension access or affect?
- What data-flow paths are actually evidenced?
- What is the potential blast radius if the relevant behavior is exercised?
- What changed from the comparison release?
- Which statements are observed, which are bounded inferences, and which remain unknown?
- What should a reviewer verify next?

The deterministic report, artifact hash, analyzer evidence, coverage, and existing decision remain authoritative. AI output is decision support only and must never create, remove, or upgrade a finding or change `allow`, `review`, `block`, or `incomplete`.

## 1. Requirements & Constraints

### Functional requirements

- **REQ-001**: Generate the intelligence report only for the exact `extensionId`, `version`, and `scanId` requested by the report URL, and display the artifact SHA-256 in the result.
- **REQ-002**: Use the full available structured report context: scan outcome and rationale, normalized capabilities, findings, evidence classes, file references, package inventory, dependencies and advisories as counts, coverage, provenance, and available release comparison data. The prompt must include a manifest of omitted fields so omission is never mistaken for absence.
- **REQ-003**: Present a stable report structure with executive conclusion, exact identity, access surface, observed data flows, blast-radius assessment, release changes, positive signals, unknowns and limits, verification steps, evidence references, and the deterministic decision boundary.
- **REQ-004**: Make each material claim traceable to one or more evidence references. Claims without evidence must be labeled `unknown` or `bounded_inference`; the UI must not present them as observed facts.
- **REQ-005**: Describe capability and impact globally using an asset taxonomy rather than focusing on Indian languages, translation, or regional workflow assumptions. The first taxonomy must cover workspace/files, secrets and credentials, editor state, terminal/process execution, network/external services, persistence/startup, integrity changes, availability, and dependency/supply-chain exposure where the report supports those facts.
- **REQ-006**: Provide an evidence-backed “what it can access” inventory with scope, access type, observed status, preconditions when known, and direct links to the relevant report section or file evidence.
- **REQ-007**: Provide a blast-radius matrix across confidentiality, integrity, availability, network reach, persistence, and supply-chain impact. Each dimension must include level, rationale, preconditions, and evidence references. The wording must say “potential blast radius based on observed evidence,” not assert compromise or malicious intent.
- **REQ-008**: Provide a release-delta view when a comparable analyzed version exists. It must distinguish added, removed, and unchanged capabilities/findings/files/dependencies and state when comparison is unavailable or not comparable.
- **REQ-009**: Render visuals from a typed data specification: a capability/data-flow map when there are meaningful edges and a blast-radius matrix when there are enough dimensions to justify it. The model must never return executable HTML, CSS, SVG, or arbitrary chart configuration.
- **REQ-010**: Support review lenses for security lead, engineering reviewer, and publisher response without changing evidence, risk levels, or the deterministic outcome. Add a `standard` and a more expensive `deep` review mode only if the quality and budget gates pass.
- **REQ-011**: Expose a downloadable machine-readable intelligence report and a print-friendly human report only after the same validation applied to the on-screen result. Exported content must carry exact identity, generated-at time, model metadata, evidence refs, and the AI decision-support disclosure.

### Security and privacy requirements

- **SEC-001**: Keep Sarvam credentials server-only. The client may send only a validated audience/depth choice and exact route identity; it must never send report contents or provider credentials.
- **SEC-002**: Minimize external disclosure. Do not send raw README text, complete source files, canonical report blobs, raw advisory payloads, secrets, tokens, credentials, environment values, or arbitrary user-supplied text. Standard mode sends normalized facts and bounded evidence labels; deep mode may send only redacted, hash-linked snippets from deterministic finding locations under a strict byte budget.
- **SEC-003**: Treat every report value and source snippet as untrusted data. Prompt instructions must be isolated from evidence data, and the model must be explicitly told to ignore instructions inside file names, findings, README content, dependency metadata, and source snippets.
- **SEC-004**: The AI result must be fail-closed. Invalid JSON, missing required sections, unsupported enum values, unknown evidence references, unsupported claim certainty, evidence-reference mismatch, or a decision mismatch must produce no intelligence report in the UI.
- **SEC-005**: Keep the AI path private and non-cacheable. Use authenticated access, exact-report authorization, same-origin protection, bounded request bodies, bounded provider context, `Cache-Control: private, no-store`, and response hardening headers.
- **SEC-006**: Never store chain-of-thought or request/response content in logs. Operational diagnostics may record only request identity hashes, model, latency, token/usage metadata when available, validation outcome, and safe response-shape fields.
- **SEC-007**: Escape all model strings through normal React rendering and export serializers. Reject model-provided markup, URLs used as actions, scripts, iframes, CSS, and links not created from server-known report routes.
- **SEC-008**: Keep the deterministic decision and the AI narrative visibly separate in the UI and export. A model outage, stale result, or low-confidence narrative must not affect release gates, team decisions, alerts, or policy enforcement.

### Constraints and design rules

- **CON-001**: Integrate with the current Next.js/Cloudflare Worker deployment and existing `getVersionScanProduct`, `cloudflarePrivateAvailable`, and `userFromSession` boundaries. Do not introduce a second report data source.
- **CON-002**: Preserve the existing Evidence Review Brief endpoint and response shape while adding the richer intelligence report as a separate endpoint. The scan page may present the richer report as the primary review surface without changing the legacy endpoint contract.
- **CON-003**: Use the existing Sarvam allowlist and structured-output controls in `lib/sarvam.ts`. `glm5.3-flash` is the interactive default for lower latency; `sarvam-105b` remains available as an explicit override; v2 reasoning models must retain the current thinking-disable controls for structured output.
- **CON-004**: Do not add a charting dependency for the first release. Use deterministic React/CSS/SVG primitives with accessible text fallbacks and print styles.
- **CON-005**: The implementation must tolerate incomplete reports, absent capabilities, no findings, no comparable version, truncated arrays, and Cloudflare mirror records without inventing facts.
- **CON-006**: Current in-memory request limiting is not sufficient as the only production budget control on a multi-instance Worker. The production design must use a shared limiter or durable usage ledger before enabling deep mode broadly.

### Quality guidelines and patterns

- **GUD-001**: Separate the pipeline into deterministic facts, model-authored interpretation, and deterministic validation. The model should explain evidence, not perform the scanner’s job.
- **GUD-002**: Prefer calibrated language: “observed,” “consistent with,” “could,” “requires,” and “not assessed.” Ban unsupported statements about malware, intent, exploitability, exfiltration, affected users, or remote compromise.
- **GUD-003**: Lead the report with the bottom line and exact artifact identity. Put uncertainty next to the claim it qualifies, not in a hidden footnote.
- **GUD-004**: Use visuals only when they reduce cognitive load. Label every node and edge with an evidence reference or a visible “not observed” state; do not use color alone to convey severity.
- **GUD-005**: Make report generation reproducible enough to audit: persist the schema version, evidence-context digest, selected model, audience, depth, and validation status, but not raw prompts or hidden reasoning.
- **PAT-001**: Extend the bounded projection pattern in `buildReviewEvidence` instead of passing the raw product object directly to Sarvam.
- **PAT-002**: Extend the strict parsing pattern in `parseEvidenceReviewBrief`; all intelligence response parsing must be schema-first and reference-aware.
- **PAT-003**: Reuse the exact-release authorization and same-origin protections already present in `app/api/extensions/[id]/versions/[version]/scans/[scanId]/brief/route.ts`.

## 2. Implementation Steps

### Phase A — Define the evidence contract and compiler

**Goal:** Create a complete, bounded, deterministic intermediate representation of one immutable report.

| ID | Task | Implementation detail | Completion criteria |
|---|---|---|---|
| TASK-001 | Define report types | Add `EvidenceIntelligenceContext`, `EvidenceFact`, `EvidenceReference`, `AccessSurfaceEntry`, `DataFlowNode`, `DataFlowEdge`, `BlastRadiusDimension`, `ReleaseDelta`, `IntelligenceNarrative`, and `EvidenceIntelligenceReport` in `lib/evidenceIntelligence.ts`. Include `schema_version`, exact identity, context digest, omitted-field manifest, and validation status. | TypeScript types describe every UI/export field and have no `unknown` escape hatch in the final narrative type. |
| TASK-002 | Compile complete report context | Add `compileEvidenceIntelligenceContext(product)` in `lib/evidenceIntelligence.ts` using the output of `getVersionScanProduct`. Normalize scan outcome, coverage, provenance, capabilities, findings, file inventory, dependencies, and version metadata. Generate stable evidence refs such as `scan.decision`, `capability.<key>`, `finding.<id-or-index>`, `file.<path>`, and `dependency.<name>`. | The compiler is deterministic, bounded, identity-checked, and records every omitted or unavailable section. |
| TASK-003 | Compute access surface | Add `deriveAccessSurface(context)` in `lib/evidenceIntelligence.ts`. Map only scanner-observed capability/finding evidence into normalized assets, operations, scope, preconditions, and evidence refs. Keep “declared,” “detected,” “inferred,” and “not assessed” distinct. | A fixture report produces stable access entries; unsupported capability names are retained as `unknown_capability` rather than silently dropped. |
| TASK-004 | Compute blast radius | Add `deriveBlastRadius(context)` in `lib/evidenceIntelligence.ts`. Apply documented rules to reach, impact, preconditions, coverage, and evidence strength. Return dimension levels plus rationale and refs; do not calculate a probability or claim intent. | Adding/removing an observed capability changes only the expected dimensions; a low-coverage report cannot be labeled low risk solely because no evidence was found. |
| TASK-005 | Compile release delta | Add `compileReleaseDelta(context, comparison)` and a server-side comparison loader that reuses the existing normalized compare result. Mark mixed analyzers, missing baselines, and incomparable versions explicitly. | The report never describes a version change unless both exact release identities and comparable evidence are present. |
| TASK-006 | Create golden fixtures | Add redacted fixtures under `lib/fixtures/evidence-intelligence/` for clear, expected-capability, review, block, incomplete, high-capability, and prompt-injection-shaped reports. | Fixtures contain no production secrets or raw user credentials and cover every taxonomy branch and unavailable-state path. |

### Phase B — Build the constrained Sarvam generation and quality gate

**Goal:** Use Sarvam for useful explanation while making unsupported output impossible to display.

| ID | Task | Implementation detail | Completion criteria |
|---|---|---|---|
| TASK-007 | Add intelligence generation | Add `createEvidenceIntelligenceReport(context, audience, depth)` in `lib/sarvam.ts`. Send the compiled context, a compact schema contract, and explicit uncertainty rules. Keep `temperature` low, enforce a bounded token budget, use the current model allowlist, and preserve the current structured-output controls. | The provider receives the evidence graph rather than a raw database product and returns only the declared JSON schema. |
| TASK-008 | Define claim-level output | Require `claims[]` entries with `claim_id`, `section`, `text`, `certainty`, and `evidence_refs`. Require separate arrays for `observed`, `bounded_inference`, and `unknown_or_not_assessed` where appropriate. Require visual data to use fixed enums for map and matrix types. | Every narrative sentence shown by the UI is represented by a claim with valid certainty and references. |
| TASK-009 | Implement deterministic validation | Add `parseEvidenceIntelligenceReport(value, context)` and `validateEvidenceIntelligenceReport(report, context)` in `lib/evidenceIntelligence.ts`. Validate schema, lengths, enums, exact identity, evidence refs, claim-to-section relationships, blast-radius consistency, decision immutability, and visual-node refs. | Any mutated, hallucinated, overlong, unreferenced, or decision-changing provider response is rejected with a safe internal status. |
| TASK-010 | Add deep-review policy | Implement a second pass only for explicitly requested `deep` mode or reports whose deterministic blast-radius level is broad/critical. The second pass is a critic over the first validated draft, not a new source of evidence. Store only the final validated result and safe metadata. | Standard mode stays one generation call; deep mode cannot bypass the same validator and never stores reasoning traces. |
| TASK-011 | Add budget and rollout controls | Add a server-side feature flag such as `SARVAM_INTELLIGENCE_REPORT_ENABLED`, per-user/team depth quotas, provider timeout, maximum context bytes, maximum generated claims, and shared production usage accounting. Reuse the existing brief limiter as a baseline but do not rely on its process-local map for broad rollout. | Operators can disable the feature or deep mode without a code deploy and can see safe usage/error metrics. |

### Phase C — Build the report experience and visuals

**Goal:** Present an auditable security report with clear hierarchy, useful visuals, and honest uncertainty.

| ID | Task | Implementation detail | Completion criteria |
|---|---|---|---|
| TASK-012 | Add the intelligence report component | Create `app/EvidenceIntelligenceReport.tsx` with sections for bottom line, exact identity, access surface, data flow, blast radius, release delta, positive signals, unknowns, verify next, and evidence references. Keep the existing `EvidenceReviewBrief` available during migration. | A reviewer can understand the release decision and access surface without reading generated prose first. |
| TASK-013 | Render deterministic visuals | Add `app/EvidenceIntelligenceVisuals.tsx` and a module stylesheet. Render a capability/data-flow map from server-approved nodes/edges and a blast-radius matrix from server-approved dimensions. Include a semantic table/list fallback, legends, evidence-ref links, print behavior, and `prefers-reduced-motion` support. | Visuals are readable on mobile and desktop, export/print cleanly, pass keyboard navigation and accessible-name checks, and never render model markup. |
| TASK-014 | Add report controls | Add standard/deep review controls, audience selection, generation status, validation status, generated-at metadata, regenerate behavior, and machine-readable/print export actions. Explain exactly what report context leaves Abscissa before confirmation. | A signed-in user can make an informed generation choice and can tell whether the result was validated, unavailable, or stale. |
| TASK-015 | Integrate into the dossier | Mount the component from `app/ExtensionDossier.tsx` near the existing evidence brief and pass only exact identity plus authorization state. Add a navigation entry only after the component has a validated result. | The feature is scoped to the exact report URL and does not alter existing report sections or deterministic decision controls. |

### Phase D — Add the private endpoint and exports

**Goal:** Serve the report from the exact server-side artifact boundary and make it auditable.

| ID | Task | Implementation detail | Completion criteria |
|---|---|---|---|
| TASK-016 | Add a versioned intelligence route | Create `app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.ts` with a `POST` handler. Validate route identity, auth, same-origin, content length, audience/depth, exact completed scan, and shared rate limits. Load the product server-side and call the compiler/generator. | The client cannot submit alternate report data, cross tenant boundaries, or request a different scan through the intelligence endpoint. |
| TASK-017 | Add validated exports | Extend `app/api/extensions/[id]/versions/[version]/scans/[scanId]/export/route.ts` or add a dedicated intelligence export route for JSON and print-ready HTML generated from the validated report. Do not include secrets, raw source, hidden reasoning, or provider prompt data. | Exported output contains the same evidence refs and disclosure as the UI and passes the existing immutable-export safety contract. |
| TASK-018 | Add operational diagnostics | Emit safe structured events for request accepted, provider status, validation result, latency, and usage metadata. Never log narrative text, source snippets, or API keys. | Production debugging can distinguish auth, provider, timeout, schema, and evidence-reference failures without exposing report content. |

### Phase E — Verify and roll out

**Goal:** Prove quality on adversarial and representative reports before enabling the feature broadly.

| ID | Task | Implementation detail | Completion criteria |
|---|---|---|---|
| TASK-019 | Add automated tests | Add `lib/evidenceIntelligence.test.ts` for compiler, access mapping, blast-radius rules, schema parsing, ref validation, omission behavior, and malicious model output. Extend `lib/sarvam.test.ts` for the new request schema and reasoning controls. | Tests cover all report states and fail if the model invents a capability, uses a foreign evidence ref, or changes the deterministic decision. |
| TASK-020 | Add route tests | Add `app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.test.ts` for auth, exact identity, same-origin, bounded body, rate limits/quotas, provider failures, stale identity, and no-store headers. | Security boundary tests pass for both Cloudflare private data and the Supabase fallback path. |
| TASK-021 | Add UI and export tests | Extend `app/ExtensionDossier.test.ts` and add a visual/accessibility test for the intelligence component. Test loading/error/validated/unknown states, keyboard access, responsive semantic fallback, and export disclosure. | No raw model markup is rendered and the report remains useful when visuals are unavailable. |
| TASK-022 | Run a production canary | Enable the feature for internal accounts and a small set of high-signal exact reports. Verify provider success, validation rejection behavior, latency, quota consumption, Cloudflare logs, and browser output before expanding the flag. | The canary has zero decision mutations, zero secret leakage, zero unreferenced displayed claims, and an operator-tested rollback. |
| TASK-023 | Document the contract | Update `README.md` or the project documentation with data-sharing disclosure, model/feature flag configuration, quality guarantees, known limits, quota behavior, and rollback instructions. | Reviewers and operators can explain what Sarvam receives and what remains authoritative without inspecting implementation code. |

## 3. Alternatives

- **ALT-001 — Send the raw report to one large prompt.** Rejected. It increases prompt-injection exposure, makes omissions ambiguous, produces untraceable prose, and makes output quality dependent on model attention rather than a stable evidence contract.
- **ALT-002 — Let the model calculate blast radius from prose.** Rejected. Impact dimensions and guardrails must be deterministic and reproducible; the model can explain the result but cannot be the risk calculator.
- **ALT-003 — Replace the existing scanner decision with an LLM verdict.** Rejected. The current decision is an auditable product primitive used by reports, policy, and team workflows; AI availability must never become a release-control dependency.
- **ALT-004 — Generate SVG/HTML directly from Sarvam.** Rejected. Model-authored markup creates XSS, accessibility, and visual-consistency risk. A fixed renderer should turn safe graph data into visuals.
- **ALT-005 — Always run a second critic model call.** Deferred as the default. It doubles latency and credit consumption. Use it for opt-in deep review or broad/critical deterministic blast radius, with the same final validator.
- **ALT-006 — Add a general conversational security assistant.** Deferred. It would weaken the exact-artifact mental model and make citation completeness harder. A future assistant can consume validated intelligence reports after this contract is stable.

## 4. Dependencies

- **DEP-001**: Existing exact-report data path in `lib/productData.ts`, especially `getVersionScanProduct`, Cloudflare registry/scan mirrors, and report contract identity validation.
- **DEP-002**: Existing server authentication in `lib/cloudflarePrivate.ts`/`userFromSession` and Supabase fallback in `lib/supabaseServer.ts`.
- **DEP-003**: Sarvam API access through `SARVAM_API_KEY`, the allowlisted models in `lib/sarvam.ts`, JSON-schema response support, and current reasoning controls. Official references: [Sarvam chat completion overview](https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview), [Sarvam open-source models](https://docs.sarvam.ai/api/getting-started/models/open-source), and [Sarvam 105B](https://docs.sarvam.ai/api/getting-started/models/sarvam-105b).
- **DEP-004**: Shared production quota/rate-limit storage appropriate for the Cloudflare deployment. A process-local `Map` is acceptable for local development and a temporary canary only.
- **DEP-005**: Existing Next.js client component conventions, `lucide-react`, report shell styles, and the current export route. No new visualization library is required for version one.
- **DEP-006**: CI commands in `package.json`: `npm test`, `npm run lint`, `npm run build`, `npm run cf:build`, and `npm run test:e2e` for the browser smoke path.

## 5. Files

- **FILE-001**: `lib/evidenceIntelligence.ts` — typed intermediate representation, context compiler, access-surface derivation, blast-radius derivation, release-delta mapping, parser, and validator.
- **FILE-002**: `lib/evidenceIntelligence.test.ts` — deterministic fixtures, mutation tests, reference checks, and adversarial model-output tests.
- **FILE-003**: `lib/fixtures/evidence-intelligence/` — redacted representative exact-report fixtures and expected validated outcomes.
- **FILE-004**: `lib/sarvam.ts` — versioned intelligence schema, generation function, model request limits, and provider-output handling; retain the existing brief API.
- **FILE-005**: `lib/sarvam.test.ts` — request-body, schema, reasoning-control, timeout, and malformed-output coverage.
- **FILE-006**: `app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.ts` — authenticated exact-report generation endpoint.
- **FILE-007**: `app/api/extensions/[id]/versions/[version]/scans/[scanId]/intelligence/route.test.ts` — endpoint security and failure-mode tests.
- **FILE-008**: `app/EvidenceIntelligenceReport.tsx` — structured report UI and validated-state handling.
- **FILE-009**: `app/EvidenceIntelligenceVisuals.tsx` — fixed capability map and blast-radius matrix renderers with semantic fallbacks.
- **FILE-010**: `app/evidenceIntelligence.module.css` — report hierarchy, accessible status colors, responsive layout, visual map, matrix, and print styles.
- **FILE-011**: `app/ExtensionDossier.tsx` — exact report integration point and generation context wiring.
- **FILE-012**: `app/ExtensionDossier.test.ts` — dossier integration and decision-separation coverage.
- **FILE-013**: `app/api/extensions/[id]/versions/[version]/scans/[scanId]/export/route.ts` — only if the existing immutable export can safely carry the validated intelligence payload; otherwise use a dedicated export route.
- **FILE-014**: `README.md` or the project’s documentation surface — data-sharing disclosure, model selection, quotas, quality boundary, and rollback procedure.
- **FILE-015**: Cloudflare configuration/secret and shared-limiter files identified during implementation — feature flag, quota storage, and production rollout settings; do not commit API-key values.

## 6. Testing

- **TEST-001**: Compiler determinism: the same product input produces the same context digest, evidence refs, access surface, blast-radius dimensions, and omission manifest.
- **TEST-002**: Evidence mapping: every supported capability family maps to the intended asset/operation; unsupported values remain explicit unknowns.
- **TEST-003**: Blast-radius properties: no observed data source means no asserted data-access path; low coverage cannot downgrade risk; adding a network egress edge cannot lower network reach; removing evidence removes or downgrades only the affected dimension.
- **TEST-004**: Claim validation: reject claims with missing refs, foreign refs, incorrect certainty, unsupported section names, excessive length, or wording that asserts intent/malware/exploitability without deterministic evidence.
- **TEST-005**: Prompt-injection resistance: finding summaries, paths, README-like fields, dependency names, and source snippets containing instructions must not alter system rules or produce executable output.
- **TEST-006**: Provider contract: verify `sarvam-105b` uses the current structured-output reasoning control, v2 models disable thinking for JSON mode, the model is allowlisted, and provider output is never logged as content.
- **TEST-007**: Route security: test exact scan binding, authentication, same-origin enforcement, body/context limits, shared quota, timeout handling, provider 429/5xx handling, private no-store headers, and safe error messages.
- **TEST-008**: Decision immutability: mutate every AI decision-like field in a mocked response and confirm the endpoint rejects it or returns the deterministic decision unchanged; confirm team/policy routes do not consume AI output.
- **TEST-009**: UI accessibility: run keyboard navigation and axe checks for the report, map, matrix, evidence-ref links, loading state, error state, unknown state, and semantic fallback.
- **TEST-010**: Export safety: confirm JSON/print output contains exact identity and refs but not raw source, secrets, hidden reasoning, prompts, or arbitrary model markup.
- **TEST-011**: Browser production smoke: on a signed-in exact report, generate standard intelligence, verify the validated result, reload it, trigger a provider/error path, and confirm the deterministic report remains fully usable.

Quality gates for launch:

- 100% of displayed material claims have valid evidence refs or an explicit unknown/inference label.
- 0 changes to deterministic decision, severity, coverage, artifact hash, findings, or team policy state.
- 0 raw credentials, API keys, source blobs, hidden reasoning, or model markup in client payloads, exports, or logs.
- 100% schema and identity validation before rendering or exporting.
- Standard report generation stays within the configured latency/context/credit budget; deep mode is quota-controlled and opt-in.
- The report states what was not assessed whenever coverage, source snapshots, comparison evidence, or capability classification is incomplete.

## 7. Risks & Assumptions

- **RISK-001**: Sarvam may produce persuasive but unsupported language. Mitigation: claim-level refs, certainty enums, banned-assertion checks, deterministic blast-radius facts, and fail-closed rendering.
- **RISK-002**: Structured-output or reasoning behavior may change across Sarvam models. Mitigation: keep models allowlisted, pin request shapes per model, retain contract tests, and make model selection a controlled server setting.
- **RISK-003**: Deep reviews can consume credits and increase latency. Mitigation: bounded context/tokens, standard mode as the default, shared quotas, and deep mode only for opt-in or broad/critical reports.
- **RISK-004**: Multiple Cloudflare instances can bypass an in-memory limiter. Mitigation: move production accounting to shared storage before broad enablement and alert on usage anomalies.
- **RISK-005**: A graph can imply more certainty than the underlying scanner evidence. Mitigation: evidence-linked edges, visible observed/inferred/unknown states, coverage banner, and a textual semantic fallback.
- **RISK-006**: Source snippets can contain secrets or prompt injection. Mitigation: standard mode excludes them; deep mode uses deterministic finding locations, redaction, byte limits, and untrusted-data instructions.
- **RISK-007**: Users may mistake “blast radius” for confirmed impact. Mitigation: use “potential blast radius,” show preconditions and evidence, and keep deterministic decision language adjacent and authoritative.
- **RISK-008**: A generated result may become stale after a report is superseded. Mitigation: bind result identity and context digest to the exact scan and never reuse it for another version or scan.
- **ASSUMPTION-001**: Current report records expose enough structured capability, finding, file, dependency, coverage, provenance, and identity data to compile a useful first report; missing fields will be shown as not assessed.
- **ASSUMPTION-002**: Users want a review artifact tied to a report, not an open-ended assistant. The first UI will optimize for auditable reading, export, and handoff.
- **ASSUMPTION-003**: Sarvam credits are available for standard generation and a bounded deep-review canary; actual per-model usage must be measured before setting final quotas.
- **ASSUMPTION-004**: Existing Cloudflare private authentication and report retrieval are the production path; Supabase remains a fallback that receives equivalent tests.

## 8. Related Specifications / Further Reading

Local implementation references:

- [Sarvam integration](/home/akprajwal/VScode/ide-scanner-web/lib/sarvam.ts)
- [Exact report product loader](/home/akprajwal/VScode/ide-scanner-web/lib/productData.ts)
- [Report identity contract](/home/akprajwal/VScode/ide-scanner-web/lib/reportContract.ts)
- [Current evidence brief UI](/home/akprajwal/VScode/ide-scanner-web/app/EvidenceReviewBrief.tsx)
- [Current exact-report brief route](/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/brief/route.ts)
- [Dossier integration surface](/home/akprajwal/VScode/ide-scanner-web/app/ExtensionDossier.tsx)
- [Immutable report export route](/home/akprajwal/VScode/ide-scanner-web/app/api/extensions/[id]/versions/[version]/scans/[scanId]/export/route.ts)

Provider references:

- [Sarvam chat completion overview](https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview)
- [Sarvam open-source models](https://docs.sarvam.ai/api/getting-started/models/open-source)
- [Sarvam 105B model](https://docs.sarvam.ai/api/getting-started/models/sarvam-105b)
