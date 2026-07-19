# InSight AI Production Readiness

Status: **NO-GO** until the external launch gates below are completed and re-verified.

## Reviewed

- Next.js frontend, layouts, loading/error/empty states, responsive CSS, accessibility, and navigation
- Authentication, OAuth callback, session refresh, protected routes, account update, and sign-out
- Fact-check request validation, uploads, usage reservations, distributed throttling, OpenAI Responses integration, web search, trust scoring, persistence, history, and results
- Supabase clients, migrations, RLS, grants, security-definer RPCs, concurrency, and idempotency
- Stripe Checkout, Customer Portal, webhook signature handling, event ordering, replay protection, and plan synchronization
- Environment handling, secret hygiene, security headers, logging, CI, dependencies, tests, build, and documentation

## Fixed

- Replaced process-local throttling with a Postgres-backed per-user rate-limit RPC for multi-instance consistency.
- Added transactional Stripe webhook event deduplication and per-user synchronization locking.
- Added same-origin checks to account, billing, fact-check, and sign-out mutations.
- Added request size checks, request correlation IDs, consistent error codes, rate-limit headers, and privacy-safe structured logs.
- Added JPG/PNG/WebP magic-byte validation; spoofed image MIME types are rejected.
- Removed persistent screenshot storage. Screenshots are validated, processed in memory, and sent to the AI provider without application retention.
- Added 10-second abort-aware Supabase timeouts and bounded OpenAI classification/research deadlines.
- Fixed claim/evidence matching so reordered model output cannot attach evidence to the wrong claim.
- Added automatic independent-source retry when the first research pass finds fewer than two publishers.
- Removed model-generated publisher/date metadata from trusted source output; publisher is derived from the verified URL and unknown dates remain null.
- Added Stripe Checkout idempotency keys and made billing fail closed on subscription-query errors.
- Added CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, and permissions policy.
- Added a production environment verifier and GitHub Actions CI for audit, lint, typecheck, tests, and build.
- Removed dead rate-limit code and unnecessary exports; Knip reports no unused files, exports, or dependencies.
- Improved mobile touch targets, upload accessibility, progress copy, history title discoverability, and source transparency.
- Updated setup, deployment, monitoring, migration, privacy, and troubleshooting documentation.

## Verified

- `npm audit --audit-level=low`: 0 vulnerabilities
- `npm run test`: 36 tests passing across 9 files
- `npm run lint`: passing
- `npm run typecheck`: passing
- Knip files/exports/dependencies/unlisted/unresolved scan: no findings
- `git diff --check`: passing
- Production build: succeeds; all 18 routes generated
- Production public routes: `/`, `/login`, `/pricing`, `/terms` return 200; unknown route returns 404
- Production security headers: CSP, HSTS, `DENY`, `nosniff`, referrer and permissions policies present; `X-Powered-By` absent
- Mobile matrix: 45 page/viewport checks at 320, 375, 390, 768, and 1440 CSS pixels with no horizontal overflow
- Fresh unauthenticated context redirects protected routes to `/login`
- Live OpenAI smoke test: mandatory search, two search actions, three verified sources, two independent publishers, deterministic scoring, and evidence/source URL intersection
- Opinion smoke test: no web search and no truth score
- Synthetic production configuration values pass the configuration verifier without exposing real secrets
- Supabase CLI project linking and terminal migration push verified; all four local/remote migration versions align
- Distributed rate limiter verified through SQL (requests 1-10 allowed, request 11 denied) and the exact Node admin client; test buckets removed

## Launch Blockers

1. **New Stripe prices require configuration.** Create the $3.99 Starter, $12.99 Pro, and $24.99 Max recurring prices and set their three deployment price IDs before enabling checkout buttons.
2. **Stripe cannot be tested end to end.** Checkout, portal, signed webhook delivery, replay, payment failure state, cancellation, and plan demotion require a coherent Stripe test-mode configuration.
3. **Unit economics require monitoring.** Plans are capped at 20/80/180 monthly checks and each difficult check is bounded to eight web searches. Alert if average cost exceeds $0.05/check or p95 exceeds $0.08/check.
4. **Operational/legal controls are external.** Error monitoring, uptime alerts, Supabase backup/restore rehearsal, retention/deletion policy, privacy policy, and counsel review are not verifiable from this repository.

## Residual Technical Risk

- Next.js/Webpack emits two cache-serialization advisories for large generated CSS/font strings. They do not affect runtime output; disabling cache would only hide the warning and slow CI.
- Multi-source research is synchronous and can take tens of seconds. The route is bounded at 180 seconds; durable background jobs are recommended before large traffic or on hosts with shorter execution limits.
- Rate limiting depends on the service-role RPC and therefore fails closed when Supabase is unavailable.
- Source evidence summaries are generated interpretations. URLs are tool-verified and scores are deterministic, but human review remains necessary for consequential claims.
- No automated browser E2E suite runs in CI yet; browser journeys were manually exercised in this audit.

## Final Release Gate

Do not launch until all items are checked:

- [ ] Add production values directly to the deployment secret store and run `npm run verify:production` successfully.
- [x] Apply all Supabase migrations in timestamp order and verify the new rate-limit and Stripe RPC signatures.
- [ ] Run signed Stripe test-mode Checkout, portal, webhook replay, failed-payment, and cancellation scenarios.
- [x] Set sustainable launch limits at 20/80/180 paid checks and cap difficult checks at eight searches; re-evaluate after 500 production checks.
- [ ] Configure error monitoring, uptime alerts, log retention, backups, and restore rehearsal.
- [ ] Publish counsel-reviewed privacy, subscription, and safety terms.
- [ ] Repeat Google OAuth, text/link/screenshot, quota, history isolation, result rendering, and mobile smoke tests in the production deployment.
- [ ] Confirm CI is required on the protected `main` branch.