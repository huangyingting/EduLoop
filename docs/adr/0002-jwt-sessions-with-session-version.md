# 0002. Auth.js JWT sessions revoked through `sessionVersion`

- Status: Accepted
- Date: 2026-11-19 (recorded; the decision predates this log)

## Context

Auth.js Credentials sign-in requires the JWT session strategy, so a session lives in an encrypted cookie instead of a database row. JWTs cannot be revoked on their own, yet password changes, provider removal, email changes, and "sign out everywhere" must end every existing session immediately.

## Decision

- Every `User` has an integer `sessionVersion`. Each JWT carries the version it was issued for.
- Server authorization reloads the user and accepts the token only while its version matches. Any security-relevant change increments the version, which invalidates every earlier cookie at once.
- Credentials sign-in claims the exact password hash and version it verified, so a concurrent reset or revocation defeats an in-flight login.
- High-impact actions also require `authenticatedAt` (set only at sign-in) to be at most 10 minutes old, and claim the exact `sessionVersion` in the same transaction as the change.

## Consequences

- Each authenticated request reads the user row; this is the cost of instant revocation.
- Revocation is all-or-nothing per account: there is no per-device session list.
- See [authentication](../authentication.md) for every flow that increments the version.
