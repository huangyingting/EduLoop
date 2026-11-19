# 0004. Database rate limiter keyed by HMAC pseudonyms

- Status: Accepted
- Date: 2026-11-19 (recorded; the decision predates this log)

## Context

Rate limits must hold across replicas and restarts, but the deployment has no Redis. Limiting by IP address or email would otherwise store those identifiers in a table that is not covered by account deletion.

## Decision

- Fixed-window counters live in the `RateLimitBucket` table, upserted per request.
- A bucket ID is `HMAC-SHA256(AUTH_SECRET, domain, window, windowStart, key)`, where the key is a scoped address or identity. The table never stores the raw address or email.
- Client addresses come from `X-Forwarded-For` using `TRUSTED_PROXY_HOPS` (one trusted proxy by default in production).
- Expired buckets are deleted with other security artifacts by `npm run data:cleanup` and opportunistically every 250 limiter operations, after the response.

## Consequences

- Each limited request costs one upsert; counters are exact across replicas.
- Rotating `AUTH_SECRET` resets every counter and signs everyone out (see [0002](0002-jwt-sessions-with-session-version.md)).
- Fixed windows allow a burst at a window boundary; limits are set with that in mind.
