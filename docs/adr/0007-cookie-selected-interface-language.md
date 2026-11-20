# 0007. Interface language chosen by cookie, with typed catalogs

- Status: Accepted
- Date: 2026-11-19

## Context

The interface was hard-coded in Simplified Chinese, and API errors mixed Chinese and English. The app needed a second interface language without changing anything for existing learners, and without a large i18n dependency.

## Decision

- `zh-CN` stays the default. A learner opts into another language with the switcher, which sets the `eduloop-locale` cookie; there is no `Accept-Language` detection.
- Catalogs are TypeScript modules. `zh-CN` defines the keys, and other locales are typed against it, so missing keys fail the build. The root layout sends only the active catalog to the browser.
- API errors keep a stable `code` and, when the learner can act on them, a `messageKey`. Server text is developer-facing English; the client renders the key in the learner's language.
- ESLint rejects CJK literals in components and pages outside the documented exemptions (content studio, legal pages).

## Consequences

- Every page renders per request because the layout reads the cookie.
- Question content is translated separately; see [ADR 0008](0008-translated-question-content.md).
- Emails stayed in the default language until accounts stored a language preference; see [ADR 0008](0008-translated-question-content.md). Details are in [Internationalization](../i18n.md).
