# AMC Translation Agent Handoff

Continue the AMC translation project autonomously in:

`/home/ythuang/workspace/EduLoop`

## Goal

Finish fresh Simplified Chinese translations for every AMC 10 and AMC 12 record, validate them, and write them to the official data files. Do not stop after a batch; continue until both datasets are complete.

## Strict Rules

- Translate only from `data/en/amc10.json` and `data/en/amc12.json`.
- Translate every question directly yourself using your own reasoning. Do not call any external translation API, LLM API, machine-translation service, or remote translation tool, and do not send the source content to any external API.
- Use only the local repository data and local utilities described in this prompt for translation and validation.
- Never inspect, copy, or reuse existing `data/zh-CN/amc10.json` or `data/zh-CN/amc12.json` translations.
- Preserve IDs, options, answer keys, image paths, formulas, solutions, and metadata.
- Translate naturally and make each question self-contained.
- Correct demonstrable OCR, formula, and source-solution defects.
- Treat `answer_info.raw_content` as authoritative when a source solution has the wrong boxed answer.
- Do not weaken any validator.
- Do not revert unrelated user changes.
- Use the repository utilities in `scripts/`; do not rely on old script copies under `/tmp`.

## Current Checkpoint

- AMC 8 is complete and currently validates at `1025/1025`. It has been written to `data/zh-CN/amc8.json`.
- AMC 10 currently validates at `325/1275` across 13 fragment files.
- Completed AMC 10 papers are: `2002A`, `2002B`, `2002P`, `2003A`, `2003B`, `2004A`, `2004B`, `2005A`, `2005B`, `2006A`, `2006B`, `2007B`, and `2008A`.
- `2007A` is still missing. Split source templates already exist for `2007A`, `2008B`, and `2009A` under `/tmp`.
- Files may have changed since an earlier handoff, especially `/tmp/eduloop-amc8-translation/2022.txt` and `/tmp/eduloop-amc10-translation/2002P.txt`. Current validation includes those changes; work with them and do not revert them.
- Translation fragments and generated source templates remain under `/tmp`; only the reusable executable utilities moved into `scripts/`.

## Repository Utilities

- `scripts/print-amc-source-paper.mjs`
- `scripts/build-amc-retranslation.mjs`
- `scripts/extract-translation-fragment.mjs`
- `scripts/diagnose-amc-field.mjs`
- `scripts/split-amc-source.mjs`
- `scripts/normalize-amc-fragment.mjs`

The builder and diagnostic tool use `/tmp/eduloop-<dataset>-translation` by default. Set `AMC_TRANSLATION_ROOT` only if a different temporary root is required.

## First Actions

Run:

```bash
node scripts/build-amc-retranslation.mjs amc8 --check
node scripts/build-amc-retranslation.mjs amc10 --check --partial
```

Expected current results are `1025/1025` for AMC 8 and `325/1275` for AMC 10. If they differ, inspect and reconcile current files without reverting user edits.

Resume AMC 10 with the split `2007A` templates:

```text
/tmp/amc10-2007A-part1-source.txt
/tmp/amc10-2007A-part2-source.txt
```

Then continue with the prepared `2008B` and `2009A` splits. Split later papers when necessary to prevent truncated or incomplete agent output:

```bash
node scripts/split-amc-source.mjs /tmp/amc10-YYYYX-source.txt /tmp/amc10-YYYYX 13
```

Generate or list paper templates with:

```bash
node scripts/print-amc-source-paper.mjs amc10 --list
node scripts/print-amc-source-paper.mjs amc10 2009B /tmp/amc10-2009B-source.txt
```

## Translation Fragment Format

```text
<<<QUESTION exact-32-hex-id>>>
<<<FIELD title>>>
...
<<<FIELD solution_0>>>
...
<<<END>>>
```

Fragment requirements:

- Copy each ID exactly from its own source block.
- Keep source order and verify ID-content pairing before validation.
- Do not include `SOURCE`, `PROTECTED`, index, slug, or paper metadata.
- In normal mode, use every source `{{P#}}` exactly once.
- Use `!RAW` only for controlled OCR repair or a complete equivalent rewrite.
- Preserve every source figure reference.
- Preserve the authoritative boxed answer.
- Include prose option fields when translation is required; numeric-only options may remain inherited from English.
- Split large papers into two fragment files when needed.

Extract an agent response with:

```bash
node scripts/extract-translation-fragment.mjs AGENT_REPORT OUTPUT_FRAGMENT
```

Use `--last` only after manually confirming that the final fenced block is the complete corrected draft. If an agent inlines protected values verbatim, normalize only exact, unambiguous matches:

```bash
node scripts/normalize-amc-fragment.mjs SOURCE_TEMPLATE TRANSLATION_FRAGMENT
```

Diagnose a field mismatch with:

```bash
node scripts/diagnose-amc-field.mjs amc10 QUESTION_ID solution_0
```

## Per-Batch Validation

After every paper or half-paper:

1. Verify source and translation ID sets and order.
2. Run `node scripts/build-amc-retranslation.mjs amc10 --check --partial` or the AMC 12 equivalent.
3. Fix every placeholder, figure, answer-key, parsing, and paper-isolation error.
4. Perform a semantic audit against the English source.
5. Scan for meta-commentary, `PROTECTED` residue, diff markers, and malformed formulas.

Do not accept a fragment merely because placeholder validation passes. Check numerical roles, omitted conditions, source OCR damage, answer reasoning, and ID-content alignment.

## Completion

When AMC 10 reaches `1275/1275`, run full validation and write it:

```bash
node scripts/build-amc-retranslation.mjs amc10 --check
node scripts/build-amc-retranslation.mjs amc10 --final
```

Then complete AMC 12 through `1163/1163` using the same workflow:

```bash
node scripts/build-amc-retranslation.mjs amc12 --check
node scripts/build-amc-retranslation.mjs amc12 --final
```

Final verification:

- AMC 8: 1025 records.
- AMC 10: 1275 records.
- AMC 12: 1163 records.
- Verify IDs, image references, answer keys, formulas, and paper labels.
- Run `npm run data:verify`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- Do not commit unless explicitly requested.
- Finish with a concise report listing counts, validation commands, and controlled source corrections.

Work autonomously through completion. Do not stop merely to provide progress or ask whether to continue.