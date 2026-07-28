# Authentication

EduLoop uses an optional first-party email/password system modeled after Visdom. Guests can practice immediately; creating an account links the current browser profile, and later logins merge any unowned guest progress into the account.

## Flow and ownership

- `POST /api/auth/register` validates and normalizes the email, hashes the password with bcrypt cost 12, creates `User`, and links the current `deviceKey` profile in one transaction.
- `POST /api/auth/login` returns one generic credential error, merges eligible guest progress, and creates a database session.
- `GET /api/auth/me` is the client auth probe; `POST /api/auth/logout` revokes the current session.
- `PATCH /api/auth/account` verifies the current password, rotates the hash, and revokes every existing session before issuing a fresh cookie.
- `DELETE /api/auth/account` verifies the current password and permanently deletes the user, sessions, learner profile, and cascade-owned learning records.
- One `User` owns at most one `LearnerProfile`. Authenticated learner APIs resolve by session `userId`; guests resolve by browser `deviceKey`.

Merging preserves profile totals and moves sessions, attempts, reports, badges, daily activity, saved questions, and review items. A profile already owned by another user is never merged. Account profiles receive an internal device key, so logging out cannot expose account progress through the former guest identifier.

## Session security

The browser receives a random 256-bit `eduloop_session` token in an `HttpOnly`, `SameSite=Lax`, path-wide cookie that is `Secure` in production and expires after 30 days. Only its SHA-256 hash is stored in `AuthSession`; logout and cascade deletion revoke rows. Each account keeps at most 10 active sessions, with the oldest sessions revoked when a new one is created. Successful login transparently upgrades password hashes whose bcrypt cost is below the current policy. Auth mutations compare `Origin` with the public `Host` and trusted-proxy protocol/host headers, and login/register have per-process IP/email rate limits.

Production must terminate HTTPS and enforce shared rate limits when running multiple replicas. Self-service password changes and account erasure are available from `/privacy`; password recovery, email verification, OAuth, MFA, school roles, and guardian-consent records are intentionally deferred and must be added before school-managed identity rollout.

## Database changes

Auth models and the optional `LearnerProfile.userId` relation exist in both Prisma schemas. Apply `20260727050000_account_auth` in SQLite and PostgreSQL before deploying the application.
