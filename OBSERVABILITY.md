# InSight AI Observability and Admin Operations

This system is the internal command center for product, reliability, AI/search, revenue, and incident operations. The browser never receives the Supabase service-role key, and ordinary users have no direct table access.

## Architecture

1. Server workflows write sanitized operational records through `src/lib/telemetry/server.ts`.
2. Browser events and Web Vitals use `POST /api/telemetry`, which enforces same-origin requests, a 16 KB body limit, a strict event allowlist, per-session rate limits, server-side user association, and metadata sanitization.
3. Supabase stores indexed metadata in dedicated observability tables protected by RLS and explicit privilege revocation.
4. Server-rendered `/admin` pages call `requireAdmin()`, which verifies `profiles.role = 'admin'` with the service-role client. User metadata cannot grant access.
5. `/api/admin/health` and `/api/admin/export` repeat the database role check. `/api/admin/alerts/evaluate` is machine-only and uses `ADMIN_CRON_SECRET`.
6. Alert rules aggregate their exact rolling window in Postgres, open one incident per breach, and resolve it after recovery.

Telemetry failure is isolated from product workflows. A write failure must never block authentication, billing, or a fact check.

## Admin routes

| Route | Purpose |
| --- | --- |
| `/admin/overview` | Executive KPIs, trends, health, incidents, recent errors |
| `/admin/users` | User growth, plans, activity, usage, filters |
| `/admin/users/[id]` | One user's metadata-only timeline, usage, billing, and errors |
| `/admin/telemetry` | Searchable acquisition, navigation, auth, product, and billing events |
| `/admin/fact-checks` | Pipeline volume, status, category, verdict, confidence, latency |
| `/admin/ai` | Model requests, tokens, exact estimated cost, retries, failures, latency |
| `/admin/search` | Search attempts, sources, citations, latency, failure reasons |
| `/admin/errors` | Sanitized errors grouped by severity, type, user, request, and fingerprint |
| `/admin/errors/[id]` | One error occurrence and sanitized diagnostic context |
| `/admin/performance` | API latency, database/upload timings, and Web Vitals |
| `/admin/revenue` | Plans, subscription state, MRR, paid events, payment failures |
| `/admin/audit` | Immutable application-level privileged-action history |
| `/admin/settings` | Alert thresholds, windows, enabled state, and incident lifecycle |

Protected APIs:

- `GET /api/admin/health`: metadata-only database, fact-check, AI, and error health.
- `GET /api/admin/export?type=<telemetry|errors|fact-checks|ai|billing>&days=30`: audited, allowlisted CSV export capped at 5,000 rows. Cells that could execute spreadsheet formulas are neutralized.
- `POST /api/admin/alerts/evaluate`: scheduled rule evaluation authenticated with `Authorization: Bearer <ADMIN_CRON_SECRET>`.

## Data model

| Table | Contents |
| --- | --- |
| `telemetry_events` | Allowlisted product and funnel events plus device/acquisition dimensions |
| `error_logs` | Fingerprinted, sanitized errors and stack traces |
| `api_logs` | Endpoint, method, status, latency, request ID, error class |
| `fact_check_logs` | Metadata-only pipeline stage, outcome, category, score, latency |
| `ai_usage_logs` | Provider/model, tokens, cost, retry, parse/refusal/timeout state |
| `web_search_logs` | Attempts, source/citation counts, latency, failure reason |
| `billing_events` | Stripe lifecycle metadata, amount, plan, status, success |
| `performance_metrics` | Web Vitals, database/upload timing, route and device context |
| `admin_audit_logs` | Admin page views, settings changes, exports, and privileged actions |
| `alert_rules` | Metric, comparison, threshold, rolling window, severity, enabled state |
| `alert_incidents` | Open, acknowledged, and resolved threshold incidents |

`profiles.role` is the authorization source. `profiles.last_active_at` supports DAU/WAU/MAU and user operations.

## Event taxonomy

Acquisition and sessions: `first_visit`, `session_started`, `session_ended`, `page_viewed`, `landing_viewed`, `pricing_viewed`.

Authentication: `signup_started`, `signup_completed`, `login_started`, `login_completed`, `login_failed`, `logout`.

Fact checking: `fact_check_started`, `input_validated`, `input_validation_failed`, `text_submitted`, `link_submitted`, `screenshot_uploaded`, `ai_request_started`, `result_generated`, `fact_check_completed`, `fact_check_failed`, `result_viewed`, `result_shared`.

Billing: `checkout_started`, `checkout_completed`, `subscription_started`, `subscription_changed`, `subscription_cancelled`, `payment_succeeded`, `payment_failed`, `free_limit_reached`, `upgrade_prompt_viewed`.

`signup_completed` is emitted by the database user trigger so OAuth process boundaries cannot lose the event. Browser intent events are not used as authoritative conversion counts.

## KPI definitions

- DAU, WAU, MAU: distinct profiles with `last_active_at` inside 1, 7, or 30 days.
- Fact-check success rate: $100 \times completed / (completed + failed + rejected)$.
- AI failure rate: $100 \times failed / (completed + failed)$.
- Search failure rate: $100 \times failed / (completed + failed)$.
- Payment failure rate: $100 \times invoice\_failed / (invoice\_paid + invoice\_failed)$.
- API p95: PostgreSQL `percentile_cont(0.95)` over request latency in the rule window.
- Conversion rate: $100 \times paid\ users / total\ users$.
- MRR: active/trialing subscription monthly amounts plus annual amounts normalized to one month.
- AI gross signal: recorded Stripe revenue minus exact recorded OpenAI usage cost. This is not GAAP profit and excludes infrastructure, fees, refunds, and tax.

Empty alert windows default healthy: success rates use 100%; failure rates, latency, and error counts use 0. In-flight records are excluded from rate denominators.

## Privacy and security

Never write raw claims, prompt text, screenshot bytes, source URLs, email addresses, cookies, authorization headers, API keys, Stripe payment methods, or webhook signatures to observability metadata.

The sanitizer drops sensitive key names, redacts known key/JWT/bearer patterns, caps values at 500 characters, arrays at 20 values, keys at 80 characters, and objects at 40 entries. Nested arbitrary objects are discarded.

All observability tables have RLS enabled. `public`, `anon`, and `authenticated` privileges are revoked table by table; only `service_role` receives data privileges. Admin pages and APIs query through server-only modules. Detail pages exclude raw submitted content.

Exports are sensitive internal artifacts even though fields are allowlisted. Store them only in the approved company vault and delete local copies after use.

## Bootstrap admin access

1. Apply the observability migration.
2. Sign in once so the profile exists.
3. In the Supabase SQL Editor, use the user's UUID, not browser metadata:

```sql
update public.profiles
set role = 'admin'
where id = '<authenticated-user-uuid>';
```

4. Sign out and back in, then open `/admin`.
5. Confirm a non-admin account is redirected to `/dashboard` and receives `403` from protected admin APIs.

Keep admin membership small. To revoke access, set `role = 'user'`. Do not build a client-side role editor.

## Alerts and external delivery

Seeded rules cover fact-check success, AI/search/payment failure rates, API p95 latency, and application error volume. Admins can change thresholds, rolling windows, severity, and enabled state in `/admin/settings`; every mutation is audited.

Create a scheduler that calls the evaluator every five minutes:

```bash
curl -X POST https://insightaiforall.com/api/admin/alerts/evaluate \
  -H "Authorization: Bearer $ADMIN_CRON_SECRET"
```

On Render, use a Cron Job or another managed scheduler. Put the secret in the scheduler and web service; never place it in a URL. Generate at least 32 random characters and rotate it after suspected disclosure.

When `ALERT_WEBHOOK_URL` is set, only incident transitions produce a five-second outbound POST. `ALERT_WEBHOOK_SECRET`, when set, is sent as a bearer token. Payload shape:

```json
{
  "source": "insight-ai",
  "occurredAt": "2026-07-19T12:00:00.000Z",
  "changes": [
    {
      "action": "opened",
      "ruleId": "ai-failure-rate",
      "ruleName": "AI failure rate",
      "severity": "critical",
      "observedValue": 18.5
    }
  ]
}
```

Point the webhook at an authenticated relay that maps this payload to Slack Block Kit, PagerDuty Events API v2, email, or the chosen incident platform. Failed delivery returns `503`, records a critical sanitized error, and leaves the incident open for the next operator review. The evaluator does not resend unchanged open incidents, preventing alert storms.

## Retention

Recommended starting policy:

- Raw telemetry, API, performance, AI, search, and fact-check operational logs: 90 days.
- Error occurrences: 180 days; retain aggregate fingerprints longer outside raw records if needed.
- Billing events and admin audit logs: 400 days or the longer period required by finance/legal policy.
- Resolved alert incidents: 400 days.

Run deletion as a controlled scheduled database job in small indexed batches. Preserve billing/audit records under a legal hold. Test retention in staging and back up before the first production purge.

## Deployment

1. Set `ADMIN_CRON_SECRET`; optionally set `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET`.
2. Dry-run and apply `20260719134156_observability_admin_portal.sql`.
3. Grant the first admin by UUID.
4. Deploy the application.
5. Configure the five-minute scheduler.
6. Call `/api/admin/health` while signed in as admin.
7. Exercise one auth, fact-check, error, billing-test, and export flow.
8. Verify non-admin rejection, RLS, incident opening/recovery, webhook receipt, and audit records.

Commands:

```bash
npx supabase db push --linked --dry-run --agent no
npx supabase db push --linked --yes --agent no
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not deploy application code that queries these tables before the migration succeeds.
