# Question content layout

The application imports Simplified Chinese content by default. Keep question files grouped by locale and keep matching filenames, IDs, order, answers, metadata, LaTeX, and figure references aligned across translations.

`catalog.json` is the versioned manifest for the default locale, every locale's file membership, and cross-locale collections. Update it whenever a dataset is added or moved; content commands reject missing or undeclared JSON files.

```text
data/
  catalog.json              # Locale and collection manifest consumed by all tools
  zh-CN/                    # Complete runtime catalog imported by the seed
    biology.json
    chemistry.json
    mathematics.json
    physics.json
    amc8.json
    amc10.json
    amc12.json
  en/                       # Upstream English archives used to produce translations
    amc8.json
    amc10.json
    amc12.json

public/question-assets/
  source/amc/               # Shared SHA-256-addressed upstream figures and manifest
  generated/zh-CN/<id>/     # Reviewed, language-specific replacement diagrams
```

Add runtime content to `data/zh-CN/`. Acquisition and deduplication scripts operate on `data/en/`; `npm run data:translate:amc` writes their Simplified Chinese counterparts to `data/zh-CN/`. Validate changes with `npm run data:audit`, `npm run data:audit:amc`, and `npm run data:audit:amc:zh`.

Shared source assets are content-addressed and must retain their provenance in `public/question-assets/source/amc/manifest.json`. Put generated assets under `generated/<locale>/<question-id>/` whenever their text or accessibility metadata is locale-specific.
