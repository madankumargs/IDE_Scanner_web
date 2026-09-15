# IDE Scanner Web

Public, version-specific security intelligence for VS Code-compatible extensions.

The product has three independently truthful modes:

- Public catalog pages resolve registry metadata and version history without an account.
- Instant Preflight groups bounded hosted-static capability hints and never emits a security decision.
- Deep Scan runs the canonical Python engine on GitHub Actions with required native, AST, Semgrep, YARA, and dependency-intelligence providers.

## Free hosted architecture

- Cloudflare Workers hosts the Next.js UI and signed ingestion APIs at `https://abscissa.dev`.
- Cloudflare D1 stores the public registry mirror used by live catalog, history, metrics, and product pages.
- Supabase Free remains the migration source for Postgres/Auth and RLS-protected workspace data until the private-data phase is complete.
- Standard GitHub-hosted runners in the public scanner repository execute exact-version Deep Scans.
- The weekly catalog workflow retains the top 250 extensions, lists registry versions, and gradually scans the latest four versions.

Apply [`supabase/migrations/001_product_intelligence.sql`](supabase/migrations/001_product_intelligence.sql) to a Supabase project, then configure the Cloudflare Worker:

```bash
NEXT_PUBLIC_SITE_URL=https://abscissa.dev
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=... # server-only; sb_secret_... preferred
GITHUB_ACTIONS_TOKEN=... # fine-grained Actions:write for IDE_Scanner only
GITHUB_REPO_OWNER=preethamak
GITHUB_SCANNER_REPO=IDE_Scanner
SCAN_CALLBACK_SECRET=... # random 32+ byte value
SCAN_RATE_LIMIT_SECRET=... # separate random value
RESEND_API_KEY=... # server-only; required for feedback and email notifications
NOTIFICATION_FROM_EMAIL=feedback@abscissa.dev # verified Resend sender
FEEDBACK_TO_EMAIL=hello@abscissa.dev # company inbox; defaults to hello@abscissa.dev
```

Configure the scanner repository Action secret `SCAN_CALLBACK_SECRET` with the same callback value. Configure the web repository Action secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
GITHUB_ACTIONS_TOKEN
```

The secret key and workflow token are server-only. Never expose them through `NEXT_PUBLIC_*` variables. Deep Scan callbacks are HMAC-verified before schema validation and ingestion.

The site-wide Feedback button stores private submissions in `feedback_submissions` and sends a plain-text notification through Resend. Apply the latest Supabase migration before enabling it in production. `FEEDBACK_TO_EMAIL` is optional when the company inbox is `hello@abscissa.dev`; set it explicitly for another inbox. If Resend is temporarily unavailable, the submission remains stored and is marked for operator follow-up.

### Sarvam evidence intelligence

The immutable report includes an optional signed-in **Evidence Intelligence** report. It compiles the complete available structured evidence for the exact artifact into an evidence graph, computes the access surface and potential blast-radius dimensions deterministically, and asks Sarvam only for a cited, calibrated interpretation. It does not send source previews, README content, canonical reports, credentials, or raw advisory payloads. The model output is schema-validated, every material claim is checked against exact-report evidence references, and the model cannot write or change a GuardRails decision.

The report presents the release identity, what the extension can access, evidence-backed data-flow visuals, a confidentiality/integrity/availability/network/persistence/supply-chain matrix, release changes when comparable evidence exists, explicit unknowns, and verification steps. Visuals are rendered by the application from validated data; the model never supplies HTML or SVG.

Configure the integration with a server-only secret after rotating any key that has been exposed:

```bash
SARVAM_API_KEY=... # server-only; never use NEXT_PUBLIC_*
SARVAM_REASONING_MODEL=sarvam-105b # optional allowlisted override
```

The default is `sarvam-105b` for the standard-key interactive report path. `deepseekv4-flash`, `glm5.2`, `glm5.3`, `glm5.3-flash`, and `gemma4` are allowlisted for operator experiments through Sarvam's `/v2` endpoint; beta models may require access for the specific key. Reasoning traces returned by beta models are intentionally discarded; only the validated report is shown. The endpoint requires authentication, limits each user to three requests per ten minutes in the shared D1 usage table, sends a bounded structured provider request with a 55-second deadline, and returns `private, no-store` responses.

The intelligence endpoint is `POST /api/extensions/:id/versions/:version/scans/:scanId/intelligence` and accepts only a bounded review goal (`install_decision`, `flag_investigation`, or `publisher_response`) and `standard` depth. It returns a concise, evidence-cited reviewer guide rather than a free-form report; the deterministic scan remains authoritative. It uses the shared D1 `app_ai_usage` window for production limiting (three requests per user per ten minutes), with the operator kill switch `SARVAM_INTELLIGENCE_REPORT_ENABLED=false`. Deep review is intentionally not exposed until a separate shared credit/quota policy is enabled.

Configure Supabase Auth with site URL `https://abscissa.dev` and redirect URLs `https://abscissa.dev/auth/callback` and `http://localhost:8765/auth/callback`. Google and GitHub OAuth use callback `https://PROJECT.supabase.co/auth/v1/callback`. Enable the corresponding production UI with `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` and `NEXT_PUBLIC_GITHUB_AUTH_ENABLED=true` only after its provider is configured in Supabase.

### Cloudflare deployment

Build and deploy the production Worker with:

```bash
npm run cf:build
npx wrangler deploy --config wrangler.jsonc
```

`wrangler.jsonc` routes `abscissa.dev/*` to the `abscissa-web-production` Worker. Vercel is not required for production and may remain paused.

### Automatic GitHub deployments

In Cloudflare Dashboard, open **Workers & Pages → abscissa-web-production → Settings → Builds → Connect** and select `preethamak/IDE_Scanner_web`. Use `main` as the production branch, `npm run cf:build` as the build command, and `npx wrangler deploy --config wrangler.jsonc` as the deploy command. After the one-time connection, every push to `main` creates a new Cloudflare deployment.

The repository also contains a GitHub Actions deployment path in
`.github/workflows/cloudflare-deploy.yml`. It applies the tracked D1 migrations
and deploys the Worker when the `CLOUDFLARE_API_TOKEN` repository secret is
present. The catalog refresh workflow mirrors the generated public snapshot
into D1 using `scripts/import-public-registry-d1.mjs`.

The first Cloudflare migration is intentionally read-only for application
behavior: public routes prefer D1 and fall back to the GitHub snapshot if D1 is
unavailable. Workspace authentication, teams, billing, and private tables still
use Supabase until their separate Cloudflare Access/D1 migration is completed.

Email sign-in uses a six-digit one-time password so users can request the code in one browser and enter it in another. In Supabase Dashboard, open **Authentication → Email Templates → Magic Link**, use `{{ .Token }}` in the message body (not `{{ .ConfirmationURL }}`), and update the subject to describe a sign-in code. Keep the code expiry short. Supabase's default sender is intended for limited development use; for a zero-cost launch, make GitHub OAuth the primary sign-in path and retain email OTP only while its delivery and template configuration are verified.

### Free-plan authentication decision

The application intentionally does not expose email-and-password sign-up, sign-in, or reset flows. It uses email OTP and OAuth instead, so Supabase's paid leaked-password-protection advisor finding is not a product password risk. Keep this visible as an accepted platform-plan exception in launch reviews; do not suppress it by adding a password flow. The regression test `lib/passwordlessAuthSurface.test.ts` protects that boundary.

## Run the complete product locally

Start the scanner service from the sibling `ide-scanner` repository:

```bash
PYTHONPATH=src .venv/bin/python -m ide_scanner.service --host 127.0.0.1 --port 8787
```

Start the website:

```bash
IDE_SCANNER_LOCAL_API=true IDE_SCANNER_API_URL=http://127.0.0.1:8787 npm run dev
```

`IDE_SCANNER_LOCAL_API=true` enables the local scanner bridge routes (`/api/inventory`, `/api/scans`, `/api/sandbox`). They scan operator-supplied filesystem paths, so they stay disabled unless this flag is set — never set it on a hosted deployment.

Open `http://127.0.0.1:8765`.

`IDE_SCANNER_API_URL` remains supported for a local or self-hosted scanner. The free public architecture uses GitHub Actions for Deep Scan jobs instead.

Optional shared authorization:

```bash
IDE_SCANNER_API_TOKEN=replace-with-a-random-token
```

Set the same token on the website and scanner service.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Scanner contract verification is maintained in the sibling repository:

```bash
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```
