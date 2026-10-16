# Question content layout

The application imports Simplified Chinese content by default. Keep question files grouped by locale and keep matching filenames, IDs, order, answers, metadata, LaTeX, and figure references aligned across translations.

`catalog.json` is the versioned manifest for the default locale, every locale's file membership, and cross-locale collections. Update it whenever a dataset is added or moved; content commands reject missing or undeclared JSON files.

```text
data/
  catalog.json              # Locale and collection manifest consumed by all tools
  schema.json               # Formal JSON Schema (Draft 2020-12) for question archives
  zh-CN/                    # Complete runtime catalog imported by the seed
    biology.json
    chemistry.json
    chinese.json
    chinese-high-school.json
    mathematics.json
    physics.json
    amc8.json
    amc10.json
    amc12.json
  en/                       # Upstream English archives used to produce translations
    amc8.json
    amc10.json
    amc12.json
  licenses/                 # Required third-party dataset notices

public/question-assets/
  source/amc/               # Shared SHA-256-addressed upstream figures and manifest
  generated/zh-CN/<id>/     # Reviewed, language-specific replacement diagrams
```

Add runtime content to `data/zh-CN/`. Acquisition and deduplication scripts operate on `data/en/`; the translation script writes their Simplified Chinese counterparts to `data/zh-CN/`. AMC records use `AMC-8`, `AMC-10`, or `AMC-12` for `grade`.

The licensed CJEval junior-high Chinese import is pinned to an upstream commit and source-file hashes. Rebuild `chinese.json` with `npm run data:import:cjeval`. CJEval does not identify an individual grade, so its records use `初中综合`; do not infer seventh, eighth, or ninth grade from question wording alone. Source `<dotted>` and related presentation tags are converted into visible plain-text emphasis, nested answers are formatted for self-assessment, and source knowledge concepts become imported topic tags.

The AGIEval high-school Chinese import is pinned to upstream commit `84ab72d94318290aad2e4ec820d535a95a1f7552` and the source JSONL SHA-256. Rebuild `chinese-high-school.json` with `npm run data:import:agieval`. The importer validates all 246 upstream rows, merges 19 repeated rows with consistent answer keys and combined paper provenance, and emits 227 unique `高三` single-choice questions. AGIEval provides answers but no explanations, so each record says that explicitly instead of presenting generated reasoning as source material. Retain `data/licenses/agieval-gaokao-mit.txt` when redistributing the derived archive.

Run specialist maintenance tools directly:

```bash
npx tsx scripts/scrape-amc.ts --competition amc8 # also accepts amc10 or amc12
node scripts/dedupe-amc-data.mjs
node scripts/localize-amc-assets.mjs
node scripts/translate-amc-to-chinese.mjs
node scripts/set-amc-grade-levels.mjs
node scripts/set-amc-grade-levels.mjs --check
npm run data:import:agieval
```

Validate all source and translated content with `npm run data:verify`.

## Unified question record schema

All question archives in `data/zh-CN/` and `data/en/` conform to the unified schema defined in `data/schema.json` (JSON Schema Draft 2020-12). Every record has the exact same 11 required camelCase properties:

- `id`: 32-character lowercase hexadecimal identifier (`^[a-f0-9]{32}$`).
- `subject`: Curriculum subject (`"数学"`, `"物理"`, `"化学"`, `"生物"`, or `"语文"`).
- `grade`: Specific grade level or competition track (`"一年级"`..`"六年级"`, `"七年级"`..`"九年级"`, `"初中综合"`, `"高一"`..`"高三"`, `"AMC-8"`, `"AMC-10"`, or `"AMC-12"`).
- `type`: Source question type classification (30 supported types defined in `data/schema.json#/$defs/QuestionType`).
- `difficulty`: Source difficulty rating (`"容易"`, `"一般"`, or `"困难"`).
- `sourcePaper`: Source examination paper, contest problem identifier, or provenance reference string.
- `stem`: Primary question prompt or reading passage text.
- `options`: Object containing only non-empty option keys (`A`, `B`, `C`, `D`, `E`); `{}` for non-choice questions.
- `answer`: Unified answer string (uppercase option letters such as `"A"` or `"BC"` for auto-gradable choice questions, or reference answer text for non-choice questions).
- `solutions`: Non-empty array of step-by-step explanation strings (`string[]`).
- `tags`: Array of non-empty topic or skill tag strings (`string[]`); `[]` when empty.

`src/lib/content.ts` is the normalization boundary where unified archive records become the application's normalized runtime model.

`npm run data:verify` begins by validating every tracked JSON file (`data/catalog.json`, `data/schema.json`, all 12 question archives, configuration files, and asset manifests). It enforces exact question keys and enum values, stable 32-character hexadecimal IDs, per-locale ID uniqueness, catalog membership, and the path, size, media type, and SHA-256 integrity of every source asset manifest entry. Add a validator when introducing a new JSON family.

Shared source assets are content-addressed and must retain their provenance in `public/question-assets/source/amc/manifest.json`. Put generated assets under `generated/<locale>/<question-id>/` whenever their text or accessibility metadata is locale-specific.
