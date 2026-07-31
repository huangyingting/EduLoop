# Authentication

EduLoop uses Auth.js (`next-auth` v5) for email/password, Google, Microsoft Entra ID, and Facebook sign-in. Guests can practice immediately without receiving an identity or durable record. Registering or signing in starts or resumes the authenticated account's learner profile.

## Auth.js flow

- `src/auth.ts` is the single Auth.js configuration. It owns providers, the Prisma adapter, credential verification, callbacks, session projection, and OAuth sign-in events.
- `GET|POST /api/auth/[...nextauth]` exposes Auth.js' CSRF, provider, callback, session, sign-in, and sign-out endpoints.
- `POST /api/auth/register` remains an EduLoop endpoint because Auth.js Credentials authenticates existing users but deliberately does not create password users. In production it creates an unverified account and schedules email delivery after returning; Credentials refuses the correct password until verification succeeds. Development without a configured email provider auto-verifies new accounts so the local setup remains self-contained.
- `POST|PATCH /api/auth/email-verification` resends and consumes 24-hour, single-use email verification links. Resend responses are generic, account lookup and delivery happen after the response, URL fragments keep tokens out of requests and referrers, and only SHA-256 token digests are stored.
- Google, Microsoft, and Facebook use Auth.js providers. Buttons appear only when that provider has a complete client-ID/client-secret pair.
- OAuth navigation goes directly through Auth.js. A successful account sign-in ensures that the user owns one learner profile; guests have no profile or progress to merge.
- `PATCH|DELETE /api/auth/account` provides password setup/rotation and full account erasure. Social-only users can set an email password; deletion is confirmed with the account email when no password exists.
- `POST|PATCH /api/auth/password-reset` issues and consumes 30-minute, single-use password reset links. Requests return a generic response before account lookup and email delivery run as a post-response task, only a SHA-256 digest is stored, successful reset verifies email ownership, and every existing session is revoked.
- `POST /api/auth/consent` records the current terms/privacy versions plus an `ADULT` or `GUARDIAN` basis in both the user snapshot and append-only `ConsentRecord`. Password registration records consent atomically. Existing and new OAuth accounts without current consent receive a provisional session, but persistent APIs reject it and no learner profile is created until acceptance. `/privacy` and export/deletion endpoints remain available so legal rights do not depend on accepting new terms.

One `User` owns exactly one `LearnerProfile` once the account is used. Authenticated learner APIs resolve the user from the Auth.js token and never accept a client-supplied learner identity. Attempts, practice sessions, reports, badges, daily activity, saved questions, and review items are available only to signed-in users.

Guests may open `/practice`, fetch public catalog/questions/hints, and submit an answer for immediate grading. That branch creates no learner, attempt, session, activity, review item, report, XP, or badge; written-response self-assessment and ten-question counters remain only in page memory. All other pages redirect to `/login`, and persistent APIs independently return `401` without a valid Auth.js session.

## Sessions and revocation

Credentials requires Auth.js' JWT session strategy. Auth.js encrypts the JWT as an HttpOnly, SameSite=Lax cookie and marks it Secure in production. `AUTH_SECRET` is the encryption key and must contain at least 32 random characters in production.

Every token contains the user's `sessionVersion`. Server authorization reads the current user from Prisma and accepts the token only when its version still matches. Password setup or rotation increments the version, invalidating every prior browser token before the client signs in again with the new password. Deleting the user invalidates all tokens immediately. Roles, linked providers, display name, and password availability are refreshed from the database rather than trusted as stale token claims.

The JWT also carries an explicit `authenticatedAt` timestamp set only when Auth.js completes a credential or provider sign-in. It is preserved when Auth.js rotates the JWT instead of relying on the token's refreshable `iat`. Linking another provider and social-only password setup or account deletion require this authentication to be no more than 10 minutes old. Older and pre-migration tokens must sign in again; password-backed changes continue to require the current password.

The migration retains existing `User` rows and bcrypt hashes but drops legacy `AuthSession` rows, so applying it signs existing browsers out once. Auth.js adapter models are `Account`, `Session`, and `VerificationToken`; `Session` is present for adapter compatibility but the current Credentials-compatible configuration uses encrypted JWT sessions.

## Account linking policy

- A provider account already stored in `Account` signs into its owning user.
- A signed-in user can connect any unclaimed configured provider from `/privacy` after reauthenticating within 10 minutes; Auth.js verifies both sessions before linking.
- Google may link an existing same-email user only when Google's `email_verified` claim is true.
- Microsoft email claims are not used for automatic linking, including with a tenant-pinned issuer. Sign in with the existing account first and connect Microsoft from `/privacy`.
- Facebook does not expose an equivalent verified-email claim, so same-email auto-linking remains disabled. Facebook accounts without an email are rejected.

## Environment

Use these callback URLs in provider consoles:

- `{AUTH_URL}/api/auth/callback/google`
- `{AUTH_URL}/api/auth/callback/microsoft-entra-id`
- `{AUTH_URL}/api/auth/callback/facebook`

Production requires `AUTH_SECRET`, a public HTTPS `AUTH_URL`, `RESEND_API_KEY`, a verified `AUTH_EMAIL_FROM` sender, and the legal entity/contact/jurisdiction values rendered by `/terms` and `/privacy-policy`. Provider variables are documented in `.env.example`; incomplete email, legal, or social-provider configuration fails `npm run env:check`. Login, registration, consent, email verification, and password recovery use hashed database-backed rate-limit buckets shared by every application replica; the trusted ingress may enforce additional network-level limits.

MFA, guardian consent, approved institutional identity, and institutional account lifecycle remain separate requirements for school-managed deployment.
