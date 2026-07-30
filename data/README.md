# Question content layout

The application imports Simplified Chinese content by default. Keep question files grouped by locale and keep matching filenames, IDs, order, answers, metadata, LaTeX, and figure references aligned across translations.

`catalog.json` is the versioned manifest for the default locale, every locale's file membership, and cross-locale collections. Update it whenever a dataset is added or moved; content commands reject missing or undeclared JSON files.

```text
data/
  catalog.json              # Locale and collection manifest consumed by all tools
  zh-CN/                    # Complete runtime catalog imported by the seed
    biology.json
    chemistry.json
    chinese.json
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

Add runtime content to `data/zh-CN/`. Acquisition and deduplication scripts operate on `data/en/`; the translation script writes their Simplified Chinese counterparts to `data/zh-CN/`. AMC records use `AMC-8`, `AMC-10`, or `AMC-12` for both `grade_band` and `grade`.

The licensed CJEval junior-high Chinese import is pinned to an upstream commit and source-file hashes. Rebuild `chinese.json` with `npm run data:import:cjeval`. CJEval does not identify an individual grade, so its records use `初中综合`; do not infer seventh, eighth, or ninth grade from question wording alone. Source `<dotted>` and related presentation tags are converted into visible plain-text emphasis, nested answers are formatted for self-assessment, and source knowledge concepts become imported topic tags.

Run specialist maintenance tools directly:

```bash
npx tsx scripts/scrape-amc.ts --competition amc8 # also accepts amc10 or amc12
node scripts/dedupe-amc-data.mjs
node scripts/localize-amc-assets.mjs
node scripts/translate-amc-to-chinese.mjs
node scripts/set-amc-grade-levels.mjs
node scripts/set-amc-grade-levels.mjs --check
```

Validate all source and translated content with `npm run data:verify`.

## Source record schema

Question archives intentionally retain the upstream snake-case envelope. Every record has the same required fields: `id`, `type`, `grade_band`, `difficulty`, `grade`, `course`, `paper`, `online_test`, `option_split`, `quality`, `question_info`, `answer_info`, `solution_info`, and `children`. A record may also carry `source_tags`, an array of imported `TOPIC`, `SKILL`, or `FORMAT` tags with a stable slug, display label, confidence, and source. The prompt, five option slots, and source answer key live under `question_info.raw_content`; the reference answer is `answer_info.raw_content`; and each explanation is a `solution_info` entry. Empty option strings are meaningful placeholders for non-choice questions.

Names such as `question_info.raw_content` and `solution_info[].solution_info` are legacy source-contract names. Do not rename them in an individual archive: acquisition, translation, audit, deduplication, and import tools all consume that contract. `src/lib/content.ts` is the normalization boundary where source fields become the application's cleaner question model. New product-facing code should use normalized fields rather than expose the archive envelope.

`npm run data:verify` begins by validating every tracked JSON file. It enforces exact question keys and value types, stable 32-character hexadecimal IDs, per-locale ID uniqueness, catalog membership, configuration and approval-file shapes, and the path, size, media type, and SHA-256 integrity of every source asset manifest entry. Add a validator when introducing a new JSON family.

Shared source assets are content-addressed and must retain their provenance in `public/question-assets/source/amc/manifest.json`. Put generated assets under `generated/<locale>/<question-id>/` whenever their text or accessibility metadata is locale-specific.
