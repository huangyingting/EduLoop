# 0003. Guests practice without any stored identity

- Status: Accepted
- Date: 2026-11-19 (recorded; the decision predates this log)

## Context

Learners should be able to try practice immediately, and many are minors. Public accounts are limited to adults and guardians, so a guest identity (cookie, anonymous user, or device ID) would mean storing data about people who never agreed to it.

## Decision

- Guests get no learner, session, attempt, activity, review item, XP, or badge. Answers, filters, and round counters live only in the open page's memory.
- Guest grading is stateless: the server checks the answer and returns the result without writing anything.
- `/api/questions/next` returns a short-lived HMAC-signed ticket with each question. Guests must present it to be graded, and graded guest answers are limited per address per day, so the answer key cannot be harvested by iterating question IDs.

## Consequences

- Refreshing the page ends a guest round; the round-complete screen invites the guest to register instead.
- Guest usage appears only in aggregate request metrics, never as learner data.
- Signed-in learners are bounded by account rate limits instead of tickets.
