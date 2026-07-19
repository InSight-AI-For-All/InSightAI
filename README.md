# InSight AI

InSight AI is a mobile-first, evidence-assisted fact-checking SaaS foundation. Signed-in users can submit text, links, or screenshots, receive a structured analysis, and revisit a private check history. It deliberately treats truth as an evidence-assisted score rather than absolute authority.

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the current launch status, verified checks, blockers, and release gate.

## Product scope

- Google OAuth through Supabase Auth
- Text, link, and screenshot analysis through `gpt-5-nano` with web search
- Strict structured JSON with claim-level findings, verified evidence, source tiers, score rationale, uncertainty, limitations, and next steps
- Explicit opinion, satire, outdated-context, and unverifiable classifications
- Three lifetime checks on Free; 20/month on Starter at $3.99, 80/month on Pro at $12.99, and 180/month on Max at $24.99
- Atomic, server-enforced usage reservations with idempotency and failure rollback
- Private history with category, verdict, date, and text filters
- Stripe Checkout, signed webhook synchronization, and Customer Portal
- Supabase Postgres RLS and private Storage policies
- Responsive landing, authentication, dashboard, checker, result, history, pricing, account, and safety pages

## Stack

- Next.js 15 App Router, React 19, and TypeScript
- Tailwind CSS 4 plus scoped CSS modules
- Supabase Auth, Postgres, Storage, and RLS
- OpenAI Responses API using `gpt-5-nano` and the `web_search` tool
- Stripe subscriptions
- Zod validation and Vitest

## Local setup

Requirements: Node.js 22.12 or newer, npm, a Supabase project, an OpenAI API key, and optionally Stripe CLI.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` (`Copy-Item .env.example .env.local` in PowerShell).
3. Fill in the required values. Stripe values can stay empty while developing non-billing flows.
4. Run the files in `supabase/migrations` in timestamp order in Supabase SQL Editor. With a linked Supabase CLI project, use `supabase db push`.
5. Configure Google OAuth and Stripe as described below.
6. Run `npm run dev` and open `http://localhost:3000`.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Canonical app origin and OAuth/billing return origin |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | RLS-constrained Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Usage reservations, result persistence, and Stripe synchronization |
| `OPENAI_API_KEY` | Server only | AI requests from the fact-check API |
| `OPENAI_MODEL` | Server only | Defaults to `gpt-5-nano` |
| `STRIPE_SECRET_KEY` | Server only | Checkout, portal, and webhook API access |
| `STRIPE_WEBHOOK_SECRET` | Server only | Verifies Stripe webhook signatures |
| `STRIPE_STARTER_PRICE_ID` | Server only | Legacy recurring $4.99 Starter price, retained for existing subscribers only |
| `STRIPE_STARTER_399_PRICE_ID` | Server only | New recurring $3.99 Starter price identifier |
| `STRIPE_PRO_PRICE_ID` | Server only | Recurring $12.99 Pro price identifier |
| `STRIPE_MAX_PRICE_ID` | Server only | Recurring $24.99 Max price identifier |

Never expose the service-role, OpenAI, Stripe secret, or webhook secret values to browser code.

## Supabase setup

The migrations create `profiles`, `usage_counters`, `fact_checks`, `fact_check_reservations`, `fact_check_rate_limits`, `subscriptions`, and `stripe_webhook_events`. The initial schema retains a private legacy `screenshots` bucket, but current checks do not persist screenshot files. Apply every migration in timestamp order; application code may depend on the newest RPC signature.

The `reserve_fact_check`, `complete_fact_check`, `charge_fact_check_attempt`, and `release_fact_check` functions use per-user PostgreSQL advisory locks. This prevents concurrent requests from exceeding limits. Failures before the first OpenAI request release their reservation; once an OpenAI request starts, the attempt consumes quota even if the pipeline later fails. RLS permits users to read only their records. Column grants permit profile name/avatar updates but not plan changes.

### Google OAuth

1. Create an OAuth 2.0 Web application in Google Cloud Console.
2. Add the callback shown under **Supabase > Authentication > Providers > Google**, normally `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Put the Google client ID and secret in the Supabase Google provider settings, not this app's environment.
4. Set the Supabase Site URL to `NEXT_PUBLIC_APP_URL`.
5. Allow `http://localhost:3000/auth/callback` and the production `/auth/callback` URL.

## Stripe setup

1. Create recurring monthly prices: **Starter** `$3.99`, **Pro** `$12.99`, and **Max** `$24.99` USD.
2. Set their identifiers as `STRIPE_STARTER_399_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_MAX_PRICE_ID`.
3. If the former `$4.99` Starter price has subscribers, keep its identifier in `STRIPE_STARTER_PRICE_ID`; otherwise leave it empty.
4. Enable the Customer Portal for plan switching and cancellation, and add all three active products to its configuration.
5. Register `https://<app-origin>/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
6. Set `STRIPE_WEBHOOK_SECRET` to the endpoint signing secret.
7. For local testing, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the printed signing secret.

Checkout metadata carries the authenticated Supabase user ID. Only signature-verified events update `profiles.plan`; the browser cannot set subscription state.

## AI behavior and boundaries

The trust pipeline has two model stages. Classification first separates objective claims from opinion, prediction, satire, rhetoric, belief, humor, and unverifiable content, then decomposes compound inputs into independently checkable claims. Non-factual content receives no truth score and does not trigger web search.

Factual claims then require Responses API web search with medium reasoning and search context. URL classification is capped at two searches and each of up to two research passes is capped at three, limiting a difficult check to eight paid searches. It seeks multiple independent sources, prioritizes current primary evidence, compares support and contradiction, and applies stricter standards to high-risk categories. Both stages use strict JSON Schema, are validated with Zod, and retry malformed output once.

The model does not choose final scores or verdicts. `src/lib/fact-check/trust-engine.ts` intersects every cited URL with actual tool-returned URLs, assigns deterministic source tiers, requires at least two independent directional sources per factual claim, weights Tier 1/2/3 evidence at 3/2/1, calculates truth and confidence scores, caps confidence for high-risk claims without primary evidence, and withholds the overall score when any factual claim remains unresolved. Up to ten verified sources persist with publisher/date/tier metadata and render as clickable evidence.

If evidence is missing, conflicting, inaccessible, outdated, or inconclusive, the result explicitly surfaces uncertainty. Paywalls, login requirements, robots rules, indexing gaps, and changing pages can still prevent verification. Privacy-safe logs record model, latency, attempts, search/source counts, evidence quality, and scores without logging submitted content or source URLs.

Screenshots are validated by MIME type, size, and file signature, processed in server memory, and sent as vision input to `gpt-5-nano` without being persisted by the application. If the configured model cannot accept images, the API fails gracefully and releases usage. A future OCR provider can be inserted before the AI provider without changing the submission contract.

## Security and reliability

- AI, service-role, and Stripe calls execute only in server routes.
- Every request resolves the user server-side; plan values are never accepted from clients.
- Atomic database functions prevent quota races and support idempotent retries.
- Screenshots are private, type-limited, size-limited, and user-folder scoped.
- OpenAI output is schema-constrained and runtime validated.
- Source URLs must be present in actual web-search output before they can influence a score or render as evidence.
- Opinions and insufficient-evidence claims are stored with a null truth score instead of an artificial number.
- Stripe signatures are verified against the raw request body.
- User errors omit stack traces and provider details.
- Per-user request throttling and plan limits are enforced transactionally in Postgres, so they remain consistent across application replicas.

## Validation

Run before deployment:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Manual release checks:

1. Sign in and cancel Google OAuth; verify a clear recovery state.
2. Submit valid and empty text, valid and malformed URLs, and supported/unsupported screenshots.
3. Force a pre-AI link-extraction failure and verify usage remains unchanged; force a post-request OpenAI failure and verify usage increases once.
4. Submit opinion, prediction, satire, and vague content; verify no truth score is assigned.
5. Submit compound and high-risk factual claims; inspect claim decomposition, contradictory evidence, source tiers, uncertainty, and score rationale.
6. Run three Free checks and verify the fourth is blocked in UI and API. Verify paid limits at 20, 80, and 180 checks.
7. Complete Checkout and verify the signed webhook promotes the account.
8. Run concurrent submissions near a limit and verify only remaining capacity succeeds.
9. Filter history and verify another user's fact-check ID returns not found.
10. Cancel in the Customer Portal and verify the webhook returns the plan to Free.

## Deployment checklist

- Deploy to a Node-compatible Next.js host such as Vercel.
- Configure a function duration of at least 180 seconds for multi-source research or move analysis to a background job on hosts with shorter limits.
- Add production environment values and run `npm run verify:production` before deploying. Never expose service-role, OpenAI, or Stripe secrets to browser variables.
- Apply every file in `supabase/migrations` in timestamp order. Verify `check_fact_check_rate_limit` and the nine-argument `sync_stripe_subscription` RPC exist before deploying application code.
- Set production Supabase Site URL and OAuth redirects.
- Add the production origin to Google OAuth settings where required.
- Create the live Stripe price and Customer Portal. Register the webhook for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`; verify a signed event updates `subscriptions` and `profiles.plan` once.
- Configure log retention and alerts for `fact_check.pipeline_failed`, `fact_check.rate_limit_failed`, `stripe.webhook_failed`, sustained 5xx responses, and latency near the 165-second analysis deadline. Logs intentionally omit claims, source URLs, email addresses, and user IDs.
- Add error and uptime monitoring plus a data-retention/deletion policy.
- Configure Supabase backups and perform a restore rehearsal before accepting paid customers.
- Have counsel review privacy, terms, subscription, and high-impact-domain language.

## Render deployment

The repository includes `render.yaml` for a paid Render Node Web Service. The application is not a static export: Next.js route handlers, middleware, OAuth callbacks, Stripe webhooks, and long-running AI requests require a server runtime.

On Render's **New Web Service** screen, use:

| Setting | Value |
| --- | --- |
| Name | `insight-ai-for-all` |
| Language | `Node` |
| Branch | `main` |
| Region | `Ohio (US East)` |
| Root Directory | Leave blank |
| Build Command | `npm ci && npm run verify:production && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Starter` ($7/month) |
| Health Check Path | `/api/health` |
| Pre-Deploy Command | Leave blank; migrations are pushed deliberately with the Supabase CLI |
| Disk | None; the app stores no runtime files locally |
| Auto-Deploy | After CI Checks Pass |

Set these Render environment variables before the first successful build:

```env
NODE_VERSION=22.23.1
NEXT_PUBLIC_APP_URL=https://insightaiforall.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-nano
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_STARTER_PRICE_ID=... # optional legacy $4.99 price
STRIPE_STARTER_399_PRICE_ID=...
STRIPE_PRO_PRICE_ID=...
STRIPE_MAX_PRICE_ID=...
```

Do not upload `.env.local` as a secret file. Enter each value in Render's encrypted environment-variable UI. The build intentionally fails if required production values are missing or malformed.

After Render deploys the temporary `onrender.com` URL:

1. Open **Settings > Custom Domains** and add `insightaiforall.com`. Render also handles `www.insightaiforall.com` and provisions TLS.
2. Add the DNS records Render displays at the domain registrar. Remove conflicting root/`www` records and obsolete `AAAA` records during verification.
3. In Supabase **Authentication > URL Configuration**, set the Site URL to `https://insightaiforall.com` and add `https://insightaiforall.com/auth/callback` to the redirect allow list. Keep the localhost callback for development.
4. In Google Cloud, add `https://insightaiforall.com` as an authorized JavaScript origin. Keep `https://indudrpahjfsahyfncxj.supabase.co/auth/v1/callback` as the Google OAuth redirect URI.
5. In Stripe, register `https://insightaiforall.com/api/stripe/webhook` for subscription created, updated, and deleted events. Use that endpoint's own `whsec_...` value in Render.
6. Verify `https://insightaiforall.com/api/health` returns `{ "status": "ok" }`, then run the manual release checks below.

Migrations remain a controlled terminal release step:

```bash
npx supabase login --agent no
npx supabase link --project-ref indudrpahjfsahyfncxj --agent no
npx supabase db push --linked --dry-run --agent no
npx supabase db push --linked --yes --agent no
```

Do not add Supabase CLI access tokens or database passwords to Render because the application does not need them at runtime.

## Production verification

Run these checks from a clean checkout with production-equivalent environment values:

```bash
npm ci
npm audit --audit-level=high
npm run verify:production
npm run lint
npm run typecheck
npm run test
npm run build
```

The GitHub Actions workflow runs dependency audit, lint, typecheck, tests, and build on every pull request and push to `main`. It does not deploy or receive production secrets.

Manual release checks must use Stripe test mode and a non-production Supabase project first. Confirm Google sign-in/cancellation, session refresh, text/link/screenshot checks, unsupported and spoofed image rejection, search/provider timeout behavior, idempotent retry, quota enforcement, result/history isolation, Checkout cancellation/success, portal access, webhook replay, subscription cancellation, and mobile layouts at 320, 375, 390, and 768 CSS pixels.

## Troubleshooting

- **Checks return `NOT_CONFIGURED`:** verify `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are server-only and present in the deployed runtime. Run `npm run verify:production`.
- **Checks return `RATE_LIMIT_UNAVAILABLE`:** apply the latest migrations and confirm the service role can execute `check_fact_check_rate_limit(uuid)`.
- **Checks return `USAGE_ERROR`:** confirm all migrations were applied in order and inspect the `reserve_fact_check` and `charge_fact_check_attempt` RPC logs. Pre-AI failures release reservations; attempts that reached OpenAI consume quota once.
- **Google login fails:** confirm the Google redirect is the Supabase `/auth/v1/callback`, the application `/auth/callback` is in Supabase's redirect allow list, and the Site URL matches `NEXT_PUBLIC_APP_URL`.
- **Billing redirects to unavailable:** verify the Stripe secret key, recurring price ID, Customer Portal configuration, and webhook secret. Use matching test or live values; never mix modes.
- **Webhook returns 400:** confirm Stripe signs the raw body with the endpoint's exact `whsec_...` secret. A CLI listener has a different secret from a Dashboard endpoint.
- **Dashboard appears empty after login:** confirm `profiles` and `usage_counters` contain the user row and the initial migration's auth trigger is installed.
- **Screenshot submission fails:** only actual JPG, PNG, and WebP signatures up to 5 MB are accepted. Current checks process screenshots in memory and do not persist the file.

## Known limitations and next improvements

- Web search depends on public indexing and does not guarantee access to every submitted page.
- Multi-source checks are intentionally slower and more expensive than single-model responses; move them to durable background jobs if the hosting platform cannot sustain 180-second requests.
- Screenshot authenticity and provenance are not verified.
- Free, Starter, Pro, and Max are supported. Paid checks reset monthly and do not roll over.
- Storage retention and account deletion workflows are needed before broad launch.
- Add webhook reconciliation, observability, accessibility and browser E2E tests, abuse controls, and a legally reviewed privacy policy before high-scale launch.

The schema and plan registry can expand to Student, Creator, Educator, and Team/School tiers.
