---
goal: Frontend-first GuardRails security visual system and product surface refresh
version: 1.0
date_created: 2026-09-09
last_updated: 2026-09-09
owner: GuardRails
status: Planned
tags: [design, frontend, security, accessibility, responsive]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-2563eb)

This plan defines a frontend-only refresh for GuardRails. It establishes one dark security visual system across marketing pages, public intelligence pages, authenticated product surfaces, shared chrome, overlays, and error states. Backend schemas, Supabase queries, scanner behavior, billing behavior, and deployment configuration are out of scope. Where live data is unavailable, the UI must remain truthful and usable through explicit loading, empty, unavailable, and retry states.

## 1. Requirements & Constraints

- **REQ-001**: All user-facing routes must use the same dark-first visual language: near-black surfaces, restrained graphite borders, readable light text, and a single primary signal accent.
- **REQ-002**: Shared navigation, footer, buttons, badges, form controls, dialogs, banners, tables, cards, and error states must be visually and behaviorally consistent across every route.
- **REQ-003**: Product copy must describe GuardRails at company and product level. It must not reveal private implementation details, unannounced integrations, internal operations, or experimental workflows.
- **REQ-004**: The Sarvam relationship may be presented as program participation only after approved wording is available. Initial copy must use “GuardRails has been accepted into the Sarvam Startup Program” and must not imply investment, endorsement, sponsorship, or ownership.
- **REQ-005**: Live backend data is optional for frontend work. Every data-dependent surface must render an honest unavailable or empty state instead of crashing when a provider is unavailable.
- **REQ-006**: Route-specific styles must consume shared design tokens and primitives rather than reintroducing independent palettes or component variants.
- **REQ-007**: Existing product information architecture and route URLs must remain stable unless a separate navigation decision is approved.
- **SEC-001**: Never expose Supabase secrets, internal service errors, scanner credentials, private team data, or unpublished partner details in visible UI, fixtures, screenshots, or client bundles.
- **SEC-002**: Do not label a sample, cached, incomplete, or unavailable result as live, verified, safe, approved, or a security decision.
- **CON-001**: Do not modify database migrations, API contracts, authentication flows, scanner services, billing logic, or production environment configuration in this frontend workstream.
- **CON-002**: Do not use generic AI artwork, stock security imagery, decorative 3D scenes, or invented company/product logos. Use the existing `BrandMark`, verified extension artwork, Lucide icons, and approved partner assets only.
- **CON-003**: Do not use gradients, animated backgrounds, overlapping panels, clipped code, or fixed-position elements that obscure content at supported viewport sizes.
- **GUD-001**: Preserve IBM Plex Sans and IBM Plex Mono for product readability, use the existing GuardRails wordmark, and keep monospace typography for identifiers, versions, hashes, and machine-readable evidence.
- **GUD-002**: Use decision colors only for decision semantics: signal green for allowed/complete, amber for review/incomplete, red for blocked/high-risk, and blue-gray for neutral/informational states.
- **GUD-003**: Keep CTAs explicit and product-specific, such as “Check an extension”, “Inspect the evidence”, and “Compare releases”; remove vague AI-marketing language.
- **PAT-001**: Define the palette, spacing, type scale, border radii, elevation, focus ring, and responsive container tokens once in the global design layer, then consume them from route styles.
- **PAT-002**: Represent every async UI state with the same loading, empty, unavailable, and retry primitives, including server-rendered public sections and client-side authenticated panels.
- **PAT-003**: Prefer a real icon with a text label over icon-only controls; every icon-only control must have an accessible name and a visible focus treatment.

## 2. Implementation Steps

### Implementation Phase 1: Establish the dark security foundation

- **GOAL-001**: Replace the current competing light/warm style layers with a single dark GuardRails token system while preserving existing component APIs and route structure, and make the homepage testable without a live backend.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Update `app/globals.css`, `app/guardrails.css`, `app/design-system.css`, `app/visual-refresh.css`, `app/landing.css`, `app/product-ui.css`, `app/readability.css`, and `app/authority.css` so they share one token set: `--surface-0: #070a09`, `--surface-1: #0e1311`, `--surface-2: #151c19`, `--line: #26312c`, `--text: #f2f5f0`, `--muted: #9aa89f`, `--signal: #d3f36b`, `--review: #f3bd62`, `--block: #ff7b72`, and `--info: #8dd7ff`. | | |
| TASK-002 | Normalize the shared type scale, content widths, spacing scale, border radius, shadows, focus ring, selection color, reduced-motion behavior, and responsive breakpoints in the global layer. Use `max-width: 1440px`, breakpoints at `1200px`, `900px`, and `640px`, and never allow a grid or code block to overflow horizontally. | | |
| TASK-003 | Refactor `app/ui/Button.tsx`, `app/ui/Badge.tsx`, `app/ui/SelectField.tsx`, `app/ui/StatePanel.tsx`, and `app/ui/primitives.module.css` to provide the canonical primary, secondary, quiet, danger, status, loading, empty, and unavailable variants. Keep all variants keyboard accessible and contrast-compliant. | | |
| TASK-004 | Remove or replace route-level gradient, glow, pastel, and legacy color overrides that conflict with the dark token system. Keep only non-semantic line textures or static evidence-grid treatments that do not reduce contrast. In `app/home/TrustProof.tsx`, catch public-provider read failures and render an explicit `StatePanel` unavailable state so the homepage remains testable without Supabase. | | |

### Implementation Phase 2: Make the shared site chrome coherent

- **GOAL-002**: Apply the same security-oriented shell to navigation, account controls, newsletter capture, feedback, consent, error, and not-found surfaces.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | Restyle `app/layout.tsx`, `app/SiteNav.tsx`, `app/HeaderAccount.tsx`, and `app/BrandMark.tsx` with a dark sticky header, explicit active states, non-overlapping popovers, responsive navigation, and a single `Check an extension` product CTA. | | |
| TASK-006 | Restyle `app/FooterNewsletter.tsx`, `app/CookieConsent.tsx`, `app/FeedbackWidget.tsx`, and any shared footer styles so banners and dialogs use the same surface, border, focus, close-control, and mobile-safe spacing rules. | | |
| TASK-007 | Update `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/status/error.tsx`, and `app/status/loading.tsx` so failures explain availability without implying a security verdict and provide a consistent retry or navigation action. | | |
| TASK-008 | Add shared visual regression coverage for the header, navigation popover, account menu, footer, newsletter form, consent banner, feedback dialog, generic error state, and not-found state. | | |

### Implementation Phase 3: Refresh marketing and company surfaces

- **GOAL-003**: Make the public website communicate one clear product story using concrete security language, real icons, and a consistent dark layout.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | Redesign `app/home/AuthorityLanding.tsx`, `app/home/authorityLanding.module.css`, `app/home/ReleaseReviewFilm.tsx`, `app/home/releaseReviewFilm.module.css`, `app/home/DecisionMemoryFilm.tsx`, `app/home/decisionMemoryFilm.module.css`, `app/home/IdeCompatibility.tsx`, `app/home/ideCompatibility.module.css`, `app/home/MarketplaceProof.tsx`, `app/home/TrustProof.tsx`, and `app/home/LandingFaq.tsx` as a dark evidence-led homepage. Use static product diagrams, Lucide icons, and real extension metadata; do not use generic AI visuals. | | |
| TASK-010 | Add `app/home/SarvamProgramNote.tsx` only after approved public wording is confirmed. Present the relationship as a restrained company-level program note; do not add a logo, “backed by Sarvam”, “powered by Sarvam AI”, endorsement language, or co-branded lockup without written approval and original brand assets. | | |
| TASK-011 | Refresh `app/about/page.tsx`, `app/contact/page.tsx`, `app/faq/page.tsx`, `app/integrations/page.tsx`, `app/changelog/page.tsx`, `app/research/page.tsx`, `app/research/research.module.css`, `app/security/page.tsx`, `app/privacy/page.tsx`, and `app/terms/page.tsx` with shared dark company chrome and copy that stays at product/company level. | | |
| TASK-012 | Refresh `app/pricing/page.tsx`, `app/solutions/SolutionPage.tsx`, `app/solutions/data.ts`, `app/solutions/developers/page.tsx`, `app/solutions/engineering-teams/page.tsx`, `app/solutions/security-teams/page.tsx`, and `app/solutions/ai-agent-security/page.tsx` with a consistent decision-oriented pricing and solution layout. | | |
| TASK-013 | Refresh `app/status/page.tsx`, `app/status/status.module.css`, `app/badge/page.tsx`, `app/badge/BadgeBuilder.tsx`, and `app/badge/badge.module.css` so status, publisher-facing, and shareable surfaces use the same dark system and clearly distinguish public proof from promotional claims. | | |

### Implementation Phase 4: Refresh public intelligence and product surfaces

- **GOAL-004**: Make every registry, report, evidence, comparison, and analysis surface legible at a glance and resilient when live data is unavailable.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | Refresh `app/registry/page.tsx`, `app/registry/registry.module.css`, `app/catalog/page.tsx`, `app/detections/page.tsx`, `app/detections/detections.module.css`, `app/metrics/page.tsx`, `app/metrics/MetricsCatalog.tsx`, `app/benchmark/page.tsx`, `app/benchmark/benchmark.module.css`, and `app/publishers/[publisher]/page.tsx` with dark tables, truthful metric labels, icon-supported rows, and non-overflowing responsive layouts. | | |
| TASK-015 | Refresh `app/analyze/AnalyzePage.tsx`, `app/analyze/analyze.module.css`, `app/scan/page.tsx`, `app/public-scan/page.tsx`, `app/cli/page.tsx`, `app/cli/cli.css`, `app/docs/page.tsx`, `app/docs/docs.module.css`, `app/scoring/page.tsx`, and `app/ide/GuardRailsWorkbench.tsx` with consistent action hierarchy, code presentation, and explicit local/hosted state labels. | | |
| TASK-016 | Refresh `app/extensions/[id]/page.tsx`, `app/extensions/[id]/versions/[version]/page.tsx`, `app/extensions/[id]/versions/[version]/scans/[scanId]/page.tsx`, `app/extensions/ExtensionIcon.tsx`, `app/extensions/ExtensionIdentity.tsx`, `app/extensions/PermissionPassport.tsx`, `app/extensions/PermissionDiffCard.tsx`, and `app/extensions/ReleaseTimeline.tsx` with evidence-first identity, permission, version, and release-change layouts. | | |
| TASK-017 | Refresh the report and dossier system in `app/reports/page.tsx`, `app/reports/layout.tsx`, `app/reports/reports.module.css`, `app/compare/page.tsx`, `app/compare/layout.tsx`, `app/diff/page.tsx`, `app/diff/layout.tsx`, `app/diff/diff.module.css`, `app/dossier/*.tsx`, `app/dossier/reportShell.module.css`, and `app/dossier/immutableReport.module.css` so code, hashes, findings, provenance, coverage, and decisions never overlap or collapse into unreadable columns. | | |
| TASK-018 | Extend the presentation-boundary guard pattern to the remaining public registry/report route components and any server-rendered data surface that currently propagates provider failures. Catch read failures, log only server-side, and render `StatePanel` with “Live data unavailable” or “No published evidence” copy instead of a generic route crash. Do not fabricate live metrics. | | |

### Implementation Phase 5: Refresh authenticated and operational surfaces

- **GOAL-005**: Apply the same visual system to account, monitoring, workspace, invitations, settings, and internal product surfaces without changing their backend behavior.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Refresh `app/account/page.tsx`, `app/account/account.css`, `app/account/Onboarding.module.css`, `app/settings/page.tsx`, `app/settings/settings.module.css`, `app/history/page.tsx`, `app/history/layout.tsx`, and `app/design-partners/page.tsx` with consistent form, setup, status, and unavailable states. | | |
| TASK-020 | Refresh `app/monitor/page.tsx`, `app/monitor/monitor.module.css`, `app/monitor/layout.tsx`, `app/workspace/page.tsx`, `app/workspace/workspace.module.css`, `app/workspace/teamWorkspace.module.css`, `app/workspace/views/*.tsx`, and `app/workspace/layout.tsx` with a dark operational shell, readable tables, fixed-width-safe code/evidence, and clear team decision states. | | |
| TASK-021 | Refresh `app/workspace/ApiKeysPanel.tsx`, `app/workspace/BillingPanel.tsx`, `app/workspace/NotificationCenter.tsx`, `app/workspace/NotificationSettings.tsx`, `app/workspace/TeamInventoryPanel.tsx`, `app/workspace/*.module.css`, `app/InvitationAcceptance.tsx`, `app/TeamWorkspace.tsx`, `app/ReleaseEventQueue.tsx`, and related action components without changing API calls or authorization. | | |
| TASK-022 | Refresh `app/design-system/page.tsx`, `app/design-system/page.module.css`, `app/design-system/primitivesSurface.test.ts`, and route surface tests so the internal design-system page documents the same dark primitives used by production routes. | | |

### Implementation Phase 6: Backend-independent validation and browser QA

- **GOAL-006**: Prove that the frontend is visually coherent, accessible, non-overlapping, and testable even while the live backend is unavailable.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-023 | Add or update focused surface tests for all route groups using the existing `*Surface.test.ts` conventions. Assert dark token usage, concrete product copy, icon labels, truthful unavailable states, absence of generic AI copy, and preservation of required route links. | | |
| TASK-024 | Create a route smoke matrix covering `/`, `/about`, `/pricing`, `/security`, `/solutions/developers`, `/registry`, `/detections`, `/metrics`, `/benchmark`, `/analyze`, `/scan`, `/cli`, `/docs`, `/extensions/...`, `/reports`, `/monitor`, `/workspace`, `/account`, `/settings`, `/status`, `/privacy`, and `/terms`. Each route must render without horizontal overflow at 1440px, 1024px, 768px, and 390px widths. | | |
| TASK-025 | Test keyboard navigation, focus visibility, dialog escape/close behavior, reduced motion, screen-reader names for icon-only controls, color contrast, long extension IDs, long version strings, empty tables, failed provider reads, and code blocks at every supported breakpoint. | | |
| TASK-026 | Run the repository's lint, unit/surface tests, and production build after each phase. Start the local server only for browser QA; do not treat a failed Supabase request as a frontend test failure when the route renders its explicit unavailable state. | | |

## 3. Alternatives

- **ALT-001**: Apply a page-by-page redesign with unrelated colors and component markup. Rejected because it would preserve the current visual drift and make responsive fixes inconsistent.
- **ALT-002**: Replace the entire site with a new design framework. Rejected because the repository already has shared primitives, route-level tests, and established product information architecture that can be consolidated incrementally.
- **ALT-003**: Hide live backend failures by inserting invented sample metrics into public pages. Rejected because it would misrepresent security evidence and violate the product's evidence-first positioning.
- **ALT-004**: Add Sarvam branding immediately based only on program acceptance. Rejected until Sarvam supplies or approves the exact logo asset, wording, and public placement.

## 4. Dependencies

- **DEP-001**: Existing IBM Plex Sans, IBM Plex Mono, Lucide icon, and GuardRails `BrandMark` assets in the repository.
- **DEP-002**: Existing UI primitives in `app/ui/` and existing route surface-test conventions.
- **DEP-003**: A browser-capable local preview for responsive smoke testing; live Supabase access is not required for static or unavailable-state validation.
- **DEP-004**: Written approval and original brand assets from Sarvam before adding any partner logo or co-branded placement.

## 5. Files

- **FILE-001**: Global token and accessibility layers: `app/globals.css`, `app/guardrails.css`, `app/design-system.css`, `app/visual-refresh.css`, `app/landing.css`, `app/product-ui.css`, `app/readability.css`, and `app/authority.css`.
- **FILE-002**: Shared primitives: `app/ui/Button.tsx`, `app/ui/Badge.tsx`, `app/ui/SelectField.tsx`, `app/ui/StatePanel.tsx`, and `app/ui/primitives.module.css`.
- **FILE-003**: Shared chrome and global states: `app/layout.tsx`, `app/SiteNav.tsx`, `app/HeaderAccount.tsx`, `app/BrandMark.tsx`, `app/FooterNewsletter.tsx`, `app/CookieConsent.tsx`, `app/FeedbackWidget.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/status/error.tsx`, and `app/status/loading.tsx`.
- **FILE-004**: Marketing/company routes under `app/home/`, `app/about/`, `app/contact/`, `app/faq/`, `app/integrations/`, `app/changelog/`, `app/research/`, `app/security/`, `app/pricing/`, `app/solutions/`, `app/privacy/`, `app/terms/`, `app/status/`, and `app/badge/`.
- **FILE-005**: Public intelligence routes under `app/registry/`, `app/catalog/`, `app/detections/`, `app/metrics/`, `app/benchmark/`, `app/analyze/`, `app/scan/`, `app/public-scan/`, `app/extensions/`, `app/publishers/`, `app/reports/`, `app/compare/`, `app/diff/`, and `app/dossier/`.
- **FILE-006**: Authenticated and operational routes under `app/account/`, `app/settings/`, `app/history/`, `app/monitor/`, `app/workspace/`, `app/design-partners/`, `app/ide/`, `app/docs/`, `app/cli/`, and `app/scoring/`.
- **FILE-007**: New or updated partner note: `app/home/SarvamProgramNote.tsx`, with no partner logo until approval is recorded.
- **FILE-008**: Existing focused surface tests across `app/**/*Surface.test.ts`, plus any new test file needed for shared visual primitives and route smoke coverage.

## 6. Testing

- **TEST-001**: Run existing focused UI surface tests after each route group and verify no test asserts the removed light palette or stale generic marketing copy.
- **TEST-002**: Run lint and the production build with backend credentials absent; public pages must either render static content or show explicit unavailable states, never an unhandled provider exception.
- **TEST-003**: Run responsive browser smoke checks at 1440px, 1024px, 768px, and 390px widths for the route matrix in TASK-024 and verify no horizontal scroll, overlap, clipped code, hidden dialog controls, or unreadable status badges.
- **TEST-004**: Run keyboard and reduced-motion checks for shared navigation, dialogs, forms, tables, tabs, accordions, and icon-only buttons.
- **TEST-005**: Verify that visible partner copy contains only approved Sarvam wording and that no Sarvam logo or endorsement claim appears without the approved asset and permission record.

## 7. Risks & Assumptions

- **RISK-001**: A single global palette change may expose route-specific selectors with insufficient contrast or hard-coded light backgrounds; every route group needs screenshot and accessibility review after token migration.
- **RISK-002**: Existing server components may still throw when Supabase is unavailable; presentation-boundary guards must be applied before claiming backend-independent browser readiness.
- **RISK-003**: Dark surfaces can make dense evidence tables harder to scan; preserve generous row spacing, strong column labels, semantic status colors, and responsive stacking.
- **RISK-004**: Incorrect Sarvam attribution could create a public brand or endorsement issue; partner copy and assets remain gated on explicit approval.
- **ASSUMPTION-001**: The current `main` branch is the clean production baseline and route URLs should remain unchanged during the visual refresh.
- **ASSUMPTION-002**: Backend availability may remain intermittent, so fixtures are permitted only for clearly labeled visual previews and tests, never as public live evidence.
- **ASSUMPTION-003**: Lucide icons and existing GuardRails/extension assets are sufficient for the visual system; no new generic AI imagery is required.

## 8. Related Specifications / Further Reading

- `README.md` for the current route architecture, environment variables, and local development workflow.
- `app/design-system/page.tsx` and `app/design-system/primitivesSurface.test.ts` for the existing component vocabulary.
- `app/home/landingSurface.test.ts` and the other `app/**/*Surface.test.ts` files for current content and structure contracts.
- `app/privacy/page.tsx` for current public data-handling language.
- Sarvam Startup Program: https://www.sarvam.ai/startup-program
- Sarvam brand guidelines: https://www.sarvam.ai/brand-guidelines
