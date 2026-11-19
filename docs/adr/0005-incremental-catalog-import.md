# 0005. Stable-ID catalog import with soft retirement and content hashes

- Status: Accepted
- Date: 2026-11-19

## Context

The question bank is imported from JSON archives on every release. Learner attempts, saved questions, and reviews reference questions by ID, and an earlier import that deleted and recreated questions lost learner history. Re-importing the whole catalog on every deploy was also slow.

## Decision

- Questions are upserted by stable source ID. Questions missing from the source are soft-retired (`RETIRED`, `retiredAt`), never deleted.
- `data/catalog.json` `supersededSourceIds` maps replaced IDs to their successors; the import moves learner history to the successor.
- Retiring more than a small allowance (max of 5 or 1%) requires `--allow-retire` or `CATALOG_ALLOW_RETIRE`.
- Each normalized question has a `contentHash`. The import writes only new and changed questions in one transaction and records a `CatalogRelease`; when the content manifest is unchanged it skips entirely.

## Consequences

- Learner history survives content edits, merges, and removals.
- A normal release with no content changes spends about three seconds on the import.
- `npm run learners:audit` reports history that still points at missing questions.
