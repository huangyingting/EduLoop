# 0008. Translated question content keyed by stable IDs

- Status: Accepted
- Date: 2026-11-21

## Context

The English interface ([ADR 0007](0007-cookie-selected-interface-language.md)) still showed Chinese questions. The repository already ships the original English AMC archives with the same stable IDs as their Chinese translations, but grading, review history, contests, and assets all reference the single stored question.

## Decision

- Store other-language content in `QuestionTranslation` (question ID, locale, stem, options, explanation, hints, content hash), imported by the seed from catalog collections whose other locales include the default locale.
- Never translate the answer key or grading inputs. A translation is imported only when its option labels match the stored question.
- Pick content by request locale: when the interface language is not the default, serve translations where they exist. Practice selection first restricts to translated questions and falls back to the whole catalog.
- Emails follow the request's interface language; reminders use `User.locale`, stored when a signed-in learner switches language.

## Consequences

- One question has one learning history across languages, so switching language never resets progress or reviews.
- Studio edits change the stored (default-language) question only; translations change through the source archives.
- Adding a content language means adding archives with matching IDs and filenames; no schema change is needed.
