# InSight AI Authentication

InSight AI supports Google OAuth, passwordless email, and passwordless phone authentication through Supabase Auth. The application never stores passwords, OTPs, refresh tokens, SMS credentials, or OAuth client secrets.

## User flows

- Google: `/login` or `/signup` opens Google and returns through `/auth/callback`.
- Email: Supabase sends a magic link and, when the email template includes `{{ .Token }}`, a six-digit code. Either route creates a verified cookie session.
- Phone: Supabase sends a six-digit SMS code. `/verify` validates it with `verifyOtp({ type: "sms" })`.
- Protected routes redirect to `/login?next=<exact path and query>` and return there after verification.
- Sessions use `@supabase/ssr` cookies with persistence and automatic refresh. Middleware validates claims before protected content renders.
- Signing out uses a local Supabase sign-out and removes pending auth/session identifiers from session storage.

The login and signup forms intentionally use the same non-enumerating OTP request behavior. They do not reveal whether an email address or phone number already exists.

## Supabase configuration

### URLs

In **Authentication > URL Configuration**:

1. Set the production Site URL to `https://insightaiforall.com`.
2. Allow `https://insightaiforall.com/auth/callback`.
3. Keep `http://localhost:3000/auth/callback` for local development.

### Google

Enable Google under **Authentication > Providers** and configure the Google client ID and secret in Supabase. Google redirects to the Supabase callback shown in the provider panel; Supabase then returns to the application callback.

### Email

Email Auth is normally enabled by default. Keep email confirmation enabled. The default template sends a magic link and works with the existing callback.

To also show a code in the email, edit the Magic Link template under **Authentication > Email Templates** and include `{{ .Token }}`. Keep `{{ .ConfirmationURL }}` as a fallback:

```html
<h2>Your InSight AI code</h2>
<p>Enter this code in the verification screen:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>Or use this secure link: <a href="{{ .ConfirmationURL }}">Continue to InSight AI</a></p>
```

Configure a production SMTP provider before launch. Supabase's default email service is rate-limited and intended for evaluation.

### Phone

In **Authentication > Providers > Phone**:

1. Enable Phone Auth and phone signups.
2. Configure one supported SMS provider: Twilio/Twilio Verify, MessageBird, Vonage, or TextLocal.
3. Set an SMS template that includes `{{ .Code }}`.
4. Review geographic permissions and local messaging regulations.
5. Configure Auth rate limits and CAPTCHA in Supabase before high-volume launch.

SMS provider credentials stay in Supabase. Do not add them to browser variables, Render, GitHub, or application logs.

Supabase defaults to one OTP request every 60 seconds. The UI mirrors this with a resend cooldown and allows five attempts per issued code; Supabase remains authoritative for OTP expiry, verification, and abuse controls.

## Profiles and access

`public.profiles` supports nullable email and phone fields plus `auth_provider` and `auth_providers`. Database triggers create profiles and usage counters idempotently after a verified Supabase user is created, and synchronize provider metadata when Supabase updates the auth user.

Users can read only their own profile, usage, fact checks, and subscription through RLS. They can update only display fields. Email, phone, provider, plan, and role remain server-controlled. Admin access still comes exclusively from `profiles.role` and is checked server-side.

Supabase can automatically link OAuth identities that use the same verified email when its secure automatic-linking rules apply. InSight AI does not manually merge phone and email users or expose unsafe identity-linking controls. Support-assisted merges should verify ownership of every identity and use Supabase's documented admin process.

## Validation

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx supabase db push --linked --dry-run --agent no
```

Manual production checks should cover Google success/cancel, email magic link, email code when configured, phone code, incorrect and expired codes, resend cooldown, browser restart session restoration, exact `next` return, sign-out, RLS isolation, and admin separation.