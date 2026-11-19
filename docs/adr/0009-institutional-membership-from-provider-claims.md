# 0009. Institutional membership from provider claims

- Status: Accepted
- Date: 2026-11-21

## Context

Schools need their students and teachers grouped under the school, with the school's retention rules, without a separate roster import. Email addresses are not proof of membership: anyone can register `name@school.edu` with a password, and Microsoft and Facebook email claims are not verified ([authentication](../authentication.md)).

## Decision

- An `Organization` lists Google Workspace domains and an optional Microsoft Entra tenant ID.
- On OAuth sign-in, an account with no organization joins one when Google's `email_verified` and `hd` claims match a listed domain (and the account email's domain), or when the Entra `tid` matches. Operators can also add an account explicitly.
- Membership never changes consent requirements and never moves an account between organizations.
- `retentionDays` deletes inactive learner accounts in that organization through the same cascade as self-service deletion. Staff and guardian accounts are kept.
- Classes record the teacher's organization for reporting; class membership is separate and opt-in through join codes.

## Consequences

- A school enables SSO by configuring its Google Workspace or Entra tenant with EduLoop's OAuth application and registering the domain or tenant.
- Students who sign in with a password are not in the organization until an operator adds them.
- Retention deletion is irreversible; the command logs counts per organization and processes at most 200 accounts per organization per run.
