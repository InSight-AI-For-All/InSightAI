# InSight AI

InSight AI is a mobile-first, evidence-assisted fact-checking SaaS foundation. Signed-in users can submit text, links, or screenshots, receive a structured analysis, and revisit a private check history. It deliberately treats truth as an evidence-assisted score rather than absolute authority.

## Product scope

- Google OAuth through Supabase Auth
- Text, link, and screenshot analysis through `gpt-4o-mini`
- Strict structured JSON with truth score, confidence score, verdict, category, claims, evidence, limitations, and next steps
- Explicit opinion, satire, outdated-context, and unverifiable classifications
- Five total checks on Free; 1,000 checks per month on Starter at $4.99/month
- Atomic, server-enforced usage reservations with idempotency and failure rollback
- Private history with category, verdict, date, and text filters
- Stripe Checkout, signed webhook synchronization, and Customer Portal
- Supabase Postgres RLS and private Storage policies
- Responsive landing, authentication, dashboard, checker, result, history, pricing, account, and safety pages

## Stack

- Next.js 15 App Router, React 19, and TypeScript
- Tailwind CSS 4 plus scoped CSS modules
- Supabase Auth, Postgres, Storage, and RLS
- OpenAI Node SDK using `gpt-4o-mini`
- Stripe subscriptions
- Zod validation and Vitest

## Local setup

Requirements: Node.js 20.9 or newer, npm, a Supabase project, an OpenAI API key, and optionally Stripe CLI.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` (`Copy-Item .env.example .env.local` in PowerShell).
3. Fill in the required values. Stripe values can stay empty while developing non-billing flows.
4. Run `supabase/migrations/202607170001_initial_schema.sql` in Supabase SQL Editor. With a linked Supabase CLI project, use `supabase db push`.
5. Configure Google OAuth and Stripe as described below.
6. Run `npm run dev` and open `http://localhost:3000`.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Canonical app origin and OAuth/billing return origin |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe | RLS-constrained Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Stripe webhook subscription synchronization |
| `OPENAI_API_KEY` | Server only | AI requests from the fact-check API |
| `OPENAI_MODEL` | Server only | Defaults to `gpt-4o-mini` |
| `STRIPE_SECRET_KEY` | Server only | Checkout, portal, and webhook API access |
| `STRIPE_WEBHOOK_SECRET` | Server only | Verifies Stripe webhook signatures |
| `STRIPE_STARTER_PRICE_ID` | Server only | Recurring $4.99 Starter price identifier |

Never expose the service-role, OpenAI, Stripe secret, or webhook secret values to browser code.

## Supabase setup

The migration creates `profiles`, `usage_counters`, `fact_checks`, `fact_check_reservations`, and `subscriptions`, plus a private `screenshots` Storage bucket with 5 MB JPG/PNG/WebP limits.

The `reserve_fact_check`, `complete_fact_check`, and `release_fact_check` functions use per-user PostgreSQL advisory locks. This prevents concurrent requests from exceeding limits. Failed AI calls release reservations and remove uploaded screenshots. RLS permits users to read only their records. Column grants permit profile name/avatar updates but not plan changes.

### Google OAuth

1. Create an OAuth 2.0 Web application in Google Cloud Console.
2. Add the callback shown under **Supabase > Authentication > Providers > Google**, normally `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Put the Google client ID and secret in the Supabase Google provider settings, not this app's environment.
4. Set the Supabase Site URL to `NEXT_PUBLIC_APP_URL`.
5. Allow `http://localhost:3000/auth/callback` and the production `/auth/callback` URL.

## Stripe setup

1. Create a recurring monthly product named **InSight AI Starter** priced at `$4.99 USD`.
2. Set `STRIPE_STARTER_PRICE_ID` to its `price_...` identifier.
3. Enable the Customer Portal and subscription cancellation.
4. Register `https://<app-origin>/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Set `STRIPE_WEBHOOK_SECRET` to the endpoint signing secret.
6. For local testing, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the printed signing secret.

Checkout metadata carries the authenticated Supabase user ID. Only signature-verified events update `profiles.plan`; the browser cannot set subscription state.

## AI behavior and boundaries

The system prompt is in `src/lib/fact-check/prompt.ts`. OpenAI output uses strict JSON Schema and is validated again with Zod. Invalid or empty output is retried once. If both attempts fail, usage is released and the user receives a safe error.

Current link analysis does **not** scrape or retrieve submitted pages. A URL plus optional user context goes to the model, and a bare URL must be marked unverifiable. Future retrieval belongs in a separate server-side evidence service that returns typed source content and citations without changing input, usage, or persistence boundaries.

Screenshots are validated in browser and server, stored privately, and sent as vision input to `gpt-4o-mini`. If the configured model cannot accept images, the API fails gracefully, releases usage, and removes the upload. A future OCR provider can be inserted before the AI provider without changing the submission contract.

## Security and reliability

- AI, service-role, and Stripe calls execute only in server routes.
- Every request resolves the user server-side; plan values are never accepted from clients.
- Atomic database functions prevent quota races and support idempotent retries.
- Screenshots are private, type-limited, size-limited, and user-folder scoped.
- OpenAI output is schema-constrained and runtime validated.
- Stripe signatures are verified against the raw request body.
- User errors omit stack traces and provider details.
- The included rate limiter is per-process. Multi-instance production must use Upstash Redis, Vercel KV, or an API gateway keyed by authenticated user.

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
3. Force an OpenAI failure and verify usage remains unchanged.
4. Run five Free checks and verify the sixth is blocked in UI and API.
5. Complete Checkout and verify the signed webhook promotes the account.
6. Run concurrent submissions near a limit and verify only remaining capacity succeeds.
7. Filter history and verify another user's fact-check ID returns not found.
8. Cancel in the Customer Portal and verify the webhook returns the plan to Free.

## Deployment checklist

- Deploy to a Node-compatible Next.js host such as Vercel.
- Add production environment values and redeploy after changing public variables.
- Apply the migration to production Supabase.
- Set production Supabase Site URL and OAuth redirects.
- Add the production origin to Google OAuth settings where required.
- Create the live Stripe price, portal, and webhook; verify a signed event.
- Replace process-local rate limiting before multi-instance scale.
- Configure logs and alerts without logging submitted claims or screenshots.
- Add error and uptime monitoring plus a data-retention/deletion policy.
- Have counsel review privacy, terms, subscription, and high-impact-domain language.

## Known limitations and next improvements

- No live retrieval or citation engine is included; this is the highest-value next capability.
- Rate limiting is process-local until a distributed provider is configured.
- Screenshot authenticity and provenance are not verified.
- Only Free and Starter are active, though plan IDs are extensible.
- Storage retention and account deletion workflows are needed before broad launch.
- Add webhook reconciliation, observability, accessibility and browser E2E tests, abuse controls, and a legally reviewed privacy policy before high-scale launch.

The schema and plan registry can expand to Student, Creator, Educator, Pro, and Team/School tiers.
