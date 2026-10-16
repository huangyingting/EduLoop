# Source data audit

Audit date: 2026-08-03. Reproduce the structural portion with `node scripts/analyze-data.mjs`; run the full content gates with `npm run data:verify`.

## Inventory

The nine Simplified Chinese runtime files under `data/zh-CN/` contain 16,531 unique question IDs: six subject archives and separate AMC 8, AMC 10, and AMC 12 archives. Matching English AMC source files live under `data/en/`. The AMC files hold 3,462 unique questions representing 3,575 contest slots; 113 exact AMC 10/12 overlaps are stored once with merged paper provenance and solutions.

| Dimension | Distribution |
| --- | --- |
| Grade band | Primary 1,815; middle 7,111; high 4,143; AMC-8 1,025; AMC-10 1,275; AMC-12 1,162 |
| Subject | Mathematics 8,847; Chinese 2,726; physics 2,226; chemistry 1,647; biology 1,085 |
| Difficulty | Easy 7,603; medium 7,570; hard 1,358 |
| Largest grades | Middle-school comprehensive: 2,499; Grade 9: 2,403; high school year 3: 1,873 |
| Online-ready flag | True 10,545; false 5,986 |
| Quality label | Original subject/AMC provenance is preserved in `sourcePaper`; CJEval and AGIEval records identify their licensed import and pinned provenance |

The source has 30 question-type strings. Normalization reduces them to seven stable product families:

| Product family | Questions | Typical source types |
| --- | ---: | --- |
| Single choice | 9,952 | 选择题, 单选题 |
| Fill blank | 3,313 | 填空题, 单空题, 多空题 |
| Written response | 2,378 | 解答题, 简答题, 应用题, 证明题, 现代文阅读, 诗歌鉴赏 |
| Multiple choice | 392 | 多选题, 双选题, 不定项选择题 |
| Computation | 234 | 计算题 |
| True/false | 204 | 判断题 |
| Experiment/inquiry | 64 | 实验题, 探究题 and combinations |

## Content and answer quality

- All records use the same outer and nested key shape. Several files start with a UTF-8 BOM; the importer removes it before parsing.
- 10,273 questions have options. Of these, 6,599 have four, 184 have three, 3,486 have five, and four have two.
- 4,592 stems match the structural LaTeX audit. The brace-aware renderer supports both the original `$$...$$` convention and the AMC archives' `$...$` inline notation, promotes display-only environments, and normalizes reviewed legacy notation without changing the source archives. The rendering gate parses all 59,215 unique catalog formulas with KaTeX and rejects any parse failure or increase above the recorded strict/character-metric warning budgets.
- Every record has non-empty `answer` and a non-empty `solutions` entry. Choice questions store their direct option letters in `answer` (such as `"A"` or `"BC"`), while non-choice questions store the reference answer in `answer`. The non-AMC repair pass replaced every identified empty, placeholder, or legacy fallback explanation with record-specific reasoning. AGIEval does not supply explanations, so its 227 solution entries explicitly disclose that boundary and show only the source answer key.
- IDs are unique. There are 333 repeated stems, which may represent legitimate grade/source duplication and are retained under their source IDs. Five exact non-AMC content pairs—three mathematics pairs and two physics pairs—retain their distinct stable source IDs. The AGIEval importer merges 19 exact duplicate rows before assigning IDs, and its emitted archive has no duplicate content fingerprint. No AMC stem exactly duplicates a stem in the original files, and no exact question fingerprint is duplicated among the AMC files.
- Two source records contain child questions. Their parent records are retained under the stable source IDs and have reviewed, self-contained written-response versions so both sets of learning objectives remain usable.
- The AMC archives contain 1,675 figure references across 1,068 questions, including 688 question prompts. All are stored locally as 1,656 SHA-256-deduplicated files under `public/question-assets/source/amc/`; `manifest.json` retains each original source URL for provenance. The AMC audit rejects remote markers, malformed local markers, and missing files. The original subject files still use reviewed textual rewrites or approved generated replacements; unrecognized future figure references remain quarantined by default. Inline choices are recovered only when their `A/B/C...` sequence and content are complete.
- The Simplified Chinese AMC audit preserves ordinary formulas structurally and translates only reviewed prose inside LaTeX text commands. Controlled OCR repairs and complete equivalent solution rewrites are pinned by an aggregate SHA-256 approval over the exact source value, translated value, question ID, and field index. Any source drift, translation edit, added or removed exception, or field movement invalidates the approval and restores the detailed per-field audit errors.

Source normalization plus approved curation yields 10,545 published, high-confidence auto-gradable questions and 5,986 published questions that use reference-answer self-assessment. One irrecoverable mathematics record whose entire source stem was `略` (`3aa418134c3e4dbcb0e24139a5e61c5a`) and five exact duplicate subject records were removed from the bundled archives, so all 16,531 bundled runtime records are published (`0` `NEEDS_REVIEW`). The 30 repaired CJEval records and 10 repaired AGIEval source rows have pinned, provenance-labeled editorial repairs.

The non-AMC audit covers all 13,069 biology, chemistry, Chinese, mathematics, and physics records. It rejects missing stems, answers, or explanations; placeholder and legacy fallback solutions; source-field labels; invalid choice keys; answer/solution conclusions that disagree with the stored key; duplicated options; malformed braces, environments, and math delimiters; encoding damage; and raw HTML residue. All 71 inline-option choice questions have been split into structured `options`, 103 non-choice records with swapped `answer`/`solutions` have been restored to concise reference answers, 392 `【解答】`/`【分析】` split records have been consolidated, 18 bare-answer explanations have been expanded into step-by-step reasoning, and 7,579 scraped `【题文】`/`【答案】`/`【解析】` prefix markers have been stripped directly in the JSON archives.

The catalog stores 24 accessible SVG diagrams across 21 questions as `GENERATED_REPLACEMENT` assets with `APPROVED` review status (`public/question-assets/generated/zh-CN/<id>/`). In addition to the four-option vertical-angle question (`option-a.svg`..`option-d.svg`), reviewed `stem.svg` diagrams cover all 20 figure- and table-dependent biology, chemistry, mathematics, and physics questions—including enzyme catalysis, meiosis II nondisjunction, meiosis/mitosis bar-and-cell diagrams, closed ecosphere and mouse oxygen-consumption tables, a simple water purifier, rectangle folding, grid rotation/translation, triangle rotation, segment counting, parallel-line construction and angle problems, a number-line interval, intersecting ellipses, Lenz's law coil repulsion, wave/vibration graphs, a compressed spring on a block, an ionization smoke detector, a suspended-lamp force setup, and a half-deflection voltmeter resistance circuit. Practice APIs continue to expose only assets marked `APPROVED`.

The eight nonvisual records previously held for malformed choices are also usable. Compact `A/B/C/D` markers attached directly to Chinese text are parsed deterministically; three source-specific omissions or duplicate labels have reviewed option corrections; and one five-part source record is retained as a written, self-assessed response rather than being misrepresented as a single choice. Two nested source records likewise use reviewed self-assessed parent versions.

## Difficulty calibration

Source difficulty labels are treated as a prior, not ground truth. Every import runs a versioned, grade-relative structural audit over the normalized stem, options, response type, sub-question count, reasoning demands, formula load, and expected response. Each `Question` stores the original label, calibrated score, confidence, reason, and audit version. A disagreement changes the learner-facing level only when confidence is at least 0.8; otherwise the source label is retained for future subject review.

After seeding, run `node --env-file-if-exists=.env --import tsx scripts/audit-question-difficulty.ts` to verify that every row was assessed and to see transition counts and representative corrections. Add `--all` for the complete per-question JSON audit.

The three product levels retain their existing meanings: `EASY` is direct recall or one-step application, `MEDIUM` requires connected concepts or several operations, and `HARD` requires sustained multi-step reasoning, proof, synthesis, or experimental design. Difficulty is relative to the assigned grade; advanced vocabulary alone does not make a question hard.

Audit version 1 assessed all 16,537 bundled questions and changed 5,232 high-confidence mismatches. The calibrated catalog contains 9,123 easy, 4,744 medium, and 2,670 hard questions, replacing the source distribution of 7,605 easy, 7,574 medium, and 1,358 hard. The current counts include the removal of CJEval and legacy subject transport labels and the restoration of damaged prompt structure; the repaired three-result rectangular-prism item now retains its source medium level instead of being treated as a short one-step prompt. AMC difficulty is assigned per contest position (problems 1–10 easy, 11–20 medium, and 21–25 hard) and retained after the structural audit because contest ordering is the stronger source-specific signal. Curated subject review can override an individual result with confidence 1 in `content-curation.ts` without weakening the reproducible default audit.

## AGIEval high-school Chinese

`npm run data:import:agieval` downloads `data/v1_1/gaokao-chinese.jsonl` from pinned AGIEval commit `84ab72d94318290aad2e4ec820d535a95a1f7552`, rejects redirects, limits the response to 5 MB, and verifies SHA-256 `1ddcf8fa15e07a25589796dc1c72a341c2d874af8de41970262d66693f95285f`. The 246 upstream rows contain 19 exact duplicate rows with matching answers. The importer merges those paper references and deterministically emits 227 unique, four-option `高三` questions in `chinese-high-school.json`.

The archive covers 35 named source papers from 2008 through 2021. Of the 227 unique questions, 201 include their reading passage and 26 are standalone language-use questions. All retain the source paper, a stable ID, the upstream commit and file digest, a direct `A`–`D` answer key, and imported high-school Chinese and skill tags. Ten SHA-256-pinned source-row repairs correct confirmed OCR and grammar damage in a language-use item, the `围棋与国家` and `抗生素滥用与DNA污染` passages, and a 2008 classical-Chinese passage with its options. AGIEval does not provide answer explanations; EduLoop says so in every solution entry rather than generating unreviewed reasoning. The upstream `data/v1_1/LICENSE` applies the MIT License to Gaokao data, and its required notice is retained at `data/licenses/agieval-gaokao-mit.txt`.

## CJEval junior-high Chinese

The project owner confirmed a separate permission covering use, modification, learner display, repository redistribution, and commercial use of the CJEval records in EduLoop. The upstream public repository otherwise states an academic/research-only restriction, so evidence of the project-specific permission must be retained outside this repository. Preserve attribution to CJEval and its paper when redistributing the derived archive.

`npm run data:import:cjeval` downloads the three `初中语文` JSONL splits from pinned commit `590fb8f34239f642324b806b68374c303fe643bf`, verifies each source SHA-256 and record count, and deterministically rebuilds `data/zh-CN/chinese.json`. The import contains 2,499 questions: 576 source choice questions, 664 fill blanks, 597 modern-reading questions, and 662 poetry-appreciation questions. All have non-empty answers, explanations, difficulty labels, and one or more knowledge concepts. The 4,095 source knowledge links across 276 distinct labels are imported as stable topic tags.

CJEval does not identify seventh, eighth, or ninth grade, so all records use the honest `初中综合` grade. The converter renders source emphasis markup as visible plain text, formats nested answers for learner self-assessment, removes transport-only labels, restores deterministic section/paragraph/subquestion/option line breaks, applies conservative poetry line formatting, recovers safely delimited and reordered lettered choices, and preserves source split/index provenance. Thirty pinned source defects have explicit EduLoop editorial repairs. The importer corrects contradictory or mismatched choices and explanations, reconstructs incomplete option sets and substantive multi-part answers, retains one genuine two-part item for reference-answer self-assessment, repairs damaged reading quotations and repeated or near-character text, separates poem titles from first lines, restores flattened poetry structure, and corrects the reviewed Chinese large-number representation in a QR-code item. Each repair is keyed by source split/index, fails closed if its expected source text drifts, and remains labeled in the generated record's quality provenance. The import currently produces no `NEEDS_REVIEW` records, but source permission and automated checks do not replace ongoing editorial fact checking.

## Taxonomy strategy

Stable, mutually understood fields are modeled as relations or constrained strings: subject, grade band, grade, difficulty, normalized type, status, and auto-gradability.

Open-ended dimensions use `TagDimension -> Tag -> QuestionTag`:

- `TOPIC`: subject-specific themes such as geometry, mechanics, electrochemistry, or genetics.
- `SKILL`: quantitative reasoning, conceptual reasoning, scientific inquiry, visual interpretation, and real-world application.
- `FORMAT`: choice/written response, LaTeX, multi-part, and auto-graded/self-assessed.

Each question-tag link stores `source` and `confidence`. Current topic/skill tags are deterministic keyword inferences with confidence below 1. Imported structural tags use confidence 1. Teacher-reviewed tags should use `CURATED` with confidence 1 and should take precedence in future ranking.

## Recommended next content work

1. Have subject teachers review the highest-volume inferred topics before using them for mastery claims; use the protected studio for reported-question triage.
2. Add curriculum version, textbook edition, province, and explicit knowledge-point codes as new tag dimensions when that metadata becomes available.
3. Keep asset localization and integrity auditing mandatory for future diagram-dependent sources.
4. Introduce semantic duplicate detection; do not deduplicate on exact stem alone.
