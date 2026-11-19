# Content pipeline

These scripts acquire, translate, repair, and audit the question archives in `data/`. The app never imports them at runtime: it consumes only the finished JSON archives, `data/catalog.json`, and the assets under `public/question-assets/`.

| Stage | Scripts |
| --- | --- |
| Acquire AMC sources | `scrape-amc.ts`, `dedupe-amc-data.mjs`, `localize-amc-assets.mjs`, `set-amc-grade-levels.mjs` |
| Translate AMC to Simplified Chinese | `translate-amc-to-chinese.mjs`, `build-amc-retranslation.mjs`, `amc-latex.mjs`, and the fragment helpers (`split-amc-source.mjs`, `print-amc-source-paper.mjs`, `extract-translation-fragment.mjs`, `normalize-amc-fragment.mjs`, `diagnose-amc-field.mjs`); see [the translation prompt](../../docs/amc-translation-agent-prompt.md) |
| Import licensed Chinese sets | `import-cjeval-chinese.mjs` with `cjeval.mjs`; `import-agieval-high-school-chinese.mjs` with `agieval.mjs` |
| Pinned repairs | `repair-subject-data.mjs`, `stem-wave2-repairs.mjs`, `cjeval-repairs.mjs`, `cjeval-wave4-overrides.mjs`, `cjeval-wave5-overrides.mjs`, `repair-amc-data.mjs` |
| Audits (`npm run data:verify`) | `analyze-data.mjs`, `audit-subject-data.mjs`, `audit-agieval-data.mjs`, `audit-amc-data.mjs`, `audit-amc-translations.mjs`, `audit-math-rendering.ts`, `amc-audit-rules.mjs` |
| Post-seed check | `audit-question-difficulty.ts` |

`content-manifest.mjs` reads `data/catalog.json` for every script. `scripts/validate-json-schemas.mjs` stays at the top level because it also validates configuration JSON for the app.

## Tests and CI

- `npm run test:content` runs the pipeline's unit tests; `npm run data:verify` runs them plus every audit.
- The **Content** workflow (`.github/workflows/content.yml`) runs `data:verify` only when `data/`, question assets, this directory, or the normalization code it exercises changes. App CI runs `npm test` (app script tests only), `json:verify`, and `seed:verify`.

## Repairs

The repair and override modules are deterministic and pinned to upstream commits and file hashes. Their output is already committed in `data/`, so the app does not need them. They stay here so `npm run data:import:cjeval` and `npm run data:import:agieval` can rebuild the archives reproducibly from upstream. New one-off fixes should go into the source JSON directly (with a `data:verify` gate), or into `src/lib/content-curation.ts` when they are reviewed corrections rather than source repairs.

## Repository size

`data/` is about 28 MB and `public/question-assets/` about 44 MB, and both live in git history.

- **Docker images** can leave the images out (`--build-arg BUNDLE_QUESTION_ASSETS=false`) and stream them from object storage; see "Serving question images from object storage" in [operations](../../docs/operations.md).
- **Clones** fetch only what they need with `git clone --filter=blob:none`.
- **Shrinking history** for everyone requires rewriting it, for example `git filter-repo --path public/question-assets --invert-paths` after moving the images to object storage or Git LFS, then force-pushing and asking every contributor to re-clone. That is a maintainer decision and has not been done.
