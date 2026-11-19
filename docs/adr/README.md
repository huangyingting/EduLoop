# Architecture decision records

Each record captures one decision that shapes the code: the context, the choice, and what it costs. Add a new numbered file instead of rewriting an accepted record; when a decision changes, mark the old record "Superseded by NNNN".

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-dual-prisma-schemas.md) | Separate SQLite and PostgreSQL Prisma schemas with paired migrations | Accepted |
| [0002](0002-jwt-sessions-with-session-version.md) | Auth.js JWT sessions revoked through a database `sessionVersion` | Accepted |
| [0003](0003-stateless-guest-practice.md) | Guests practice without any stored identity | Accepted |
| [0004](0004-hmac-database-rate-limiter.md) | Database rate limiter keyed by HMAC pseudonyms | Accepted |
| [0005](0005-incremental-catalog-import.md) | Stable-ID catalog import with soft retirement and content hashes | Accepted |
| [0006](0006-routes-services-contracts.md) | Thin route handlers over domain services and shared contracts | Accepted |
| [0007](0007-cookie-selected-interface-language.md) | Interface language chosen by cookie, with typed catalogs | Accepted |
| [0008](0008-translated-question-content.md) | Translated question content keyed by stable IDs | Accepted |

Template:

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```
