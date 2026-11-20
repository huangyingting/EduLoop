# 0010. Delete removed questions with their learner history

- Status: Accepted
- Date: 2026-11-20
- Supersedes: the retirement part of [0005](0005-incremental-catalog-import.md)

## Context

[ADR 0005](0005-incremental-catalog-import.md) soft-retired questions that left the source and could move learner history to a replacement. EduLoop is still in development, so there is no learner history worth preserving, and retired rows, revival, and history transfer added code and state that every serving path had to respect.

## Decision

- The import deletes stored questions whose source ID is no longer in the source. Their attempts are deleted first and the affected learners' XP, level, attempt totals, daily activity, session totals, and subject and topic statistics are rebuilt from the attempts that remain; review items, saved entries, reports and moderation actions, translations, hints, options, tags, assets, contest slots, and studio revisions cascade.
- The mass-deletion guard stays: more than 5 questions or 1% of the stored catalog needs `--allow-delete=<count>` or `CATALOG_ALLOW_DELETE`, and an empty source is refused.
- `supersededSourceIds`, `retiredAt`, `supersededById`, the `RETIRED` status, and `npm run learners:audit` are removed. `CatalogRelease` records a `deleted` count.
- Content hashes, incremental writes, and release tracking from ADR 0005 are unchanged.

## Consequences

- Removing a question from the source permanently removes everyone's history for it, including its share of XP and statistics. Streaks and earned badges are not recalculated.
- `npm run learners:reconcile` rebuilds those counters for every learner and runs after each deployment seed, so totals from history deleted by earlier releases are cleared too.
- Before launch with real learners, revisit this decision: production data will likely need retirement again.
