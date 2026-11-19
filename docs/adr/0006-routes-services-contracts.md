# 0006. Thin route handlers over domain services and shared contracts

- Status: Accepted
- Date: 2026-11-19

## Context

Practice rules (grading, XP, streaks, badges, review scheduling, selection) had grown inside API route handlers and large client components. The same status strings were typed by hand in many files, and client and server kept separate copies of response shapes.

## Decision

- Route handlers only parse input, authenticate, rate limit, and map results to HTTP.
- Business rules live in services under `src/lib/` (for practice, `src/lib/practice/`).
- Request schemas and response types shared by routes and components live in `src/lib/contracts/`. Components call APIs through `apiRequest` in `src/lib/api-client.ts`.
- Persisted status, role, and action values come from `src/lib/domain-constants.ts`; ESLint rejects the raw literals elsewhere in `src/`.

## Consequences

- Services are unit-tested without HTTP and exercised end to end by the integration suite.
- Adding a status means adding a constant, which the type checker then follows everywhere.
- The practice player is a reducer (`practice-machine.ts`) plus hooks, so its state transitions are tested without a browser.
