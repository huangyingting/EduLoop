# Source data audit

Audit date: 2026-08-03. Reproduce the structural portion with `node scripts/analyze-data.mjs`; run the full content gates with `npm run data:verify`.

## Inventory

The nine Simplified Chinese runtime files under `data/zh-CN/` contain 16,022 unique question IDs: six subject archives and separate AMC 8, AMC 10, and AMC 12 archives. Matching English AMC source files live under `data/en/`. The AMC files hold 2,984 unique questions representing 3,575 contest slots; 591 exact AMC 10/12 overlaps are stored once in `amc10.json` with merged paper provenance and solutions.

| Dimension | Distribution |
| --- | --- |
| Grade band | Primary 1,815; middle 7,101; high 4,122; AMC-8 1,025; AMC-10 1,275; AMC-12 684 |
| Subject | Mathematics 8,363; Chinese 2,707; physics 2,224; chemistry 1,645; biology 1,083 |
| Difficulty | Easy 7,320; medium 7,381; hard 1,321 |
| Largest grades | Middle-school comprehensive: 2,494; Grade 9: 2,403; high school year 3: 1,856 |
| Online-ready flag | True 10,082; false 5,940 |
| Quality label | Original subject/AMC provenance is preserved in `sourcePaper`; CJEval and AGIEval records identify their licensed import and pinned provenance |

The source has 17 normalized question-type strings across seven stable product families:

| Product family | Questions | Typical source types |
| --- | ---: | --- |
| Single choice | 9,467 | 单选题 |
| Fill blank | 3,357 | 填空题 |
| Written response | 2,303 | 解答题, 诗歌鉴赏, 现代文阅读, 简答题, 综合题, 材料分析题, 复合题, 应用题, 推断题, 识图作答题, 证明题 |
| Multiple choice | 394 | 多选题 |
| True/false | 269 | 判断题 |
| Computation | 171 | 计算题 |
| Experiment/inquiry | 59 | 实验探究题 |

## Content and answer quality

- All records use the same 11-field schema (`id`, `subject`, `grade`, `type`, `difficulty`, `sourcePaper`, `stem`, `options`, `answer`, `solutions`, `tags`). Several files start with a UTF-8 BOM; the importer removes it before parsing.
- 9,861 questions have options. Of these, 6,636 have four, 214 have three, 3,009 have five, and two have two.
- 3,530 stems match the structural LaTeX audit after unwrapping non-math CJK punctuation from `$$...$$` delimiter boundaries. The brace-aware renderer supports both the original `$$...$$` convention, the AMC archives' `$...$` inline notation, and bare LaTeX environments/delimiters (`\[...\]`, `\(...\)`, `\begin{align*}...`), promotes display-only environments, and normalizes reviewed legacy notation without changing the source archives. The rendering gate parses all 70,313 unique catalog formulas across `data/zh-CN/` and `data/en/` with KaTeX and enforces `0` parse errors, `0` console warnings, and `0` strict warnings.
- Every record has non-empty `answer` and a non-empty `solutions` entry. Choice questions store their direct option letters in `answer` (such as `"A"` or `"BC"`), while non-choice questions store the reference answer in `answer`. The non-AMC repair pass replaced every identified empty, placeholder, or legacy fallback explanation with record-specific reasoning. AGIEval does not supply explanations, so its 213 solution entries explicitly disclose that boundary and show only the source answer key.
- IDs are unique. There are 331 repeated stems across distinct sub-questions or grade bands, while all exact duplicate records (`exactDuplicateContent: []` in `audit-subject-data.mjs` and `crossFileDuplicateQuestionGroups: 0` in `audit-amc-data.mjs`) have been deduplicated. The AGIEval importer merges 33 exact or passage-matched duplicate rows before assigning IDs, and its emitted archive has no duplicate content fingerprint.
- Two source records contain child questions. Their parent records are retained under the stable source IDs and have reviewed, self-contained written-response versions so both sets of learning objectives remain usable.
- The AMC archives contain 1,611 figure references across 929 questions, including 587 question prompts. All are stored locally as 1,596 SHA-256-deduplicated files under `public/question-assets/source/amc/` (including four newly generated SVG stem diagrams for AMC 8 figure-referencing problems whose upstream scrapes lacked `[asy]`/image tags); `manifest.json` retains each source or generated provenance entry. The AMC audit rejects remote markers, malformed local markers, and missing files.
- The Simplified Chinese AMC audit preserves ordinary formulas structurally and translates only reviewed prose inside LaTeX text commands. Controlled OCR repairs and complete equivalent solution rewrites are pinned by an aggregate SHA-256 approval over the exact source value, translated value, question ID, and field index. Any source drift, translation edit, added or removed exception, or field movement invalidates the approval and restores the detailed per-field audit errors.

Source normalization plus approved curation yields 10,082 published, high-confidence auto-gradable questions and 5,940 published questions that use reference-answer self-assessment. One irrecoverable mathematics record whose entire source stem was `略` (`3aa418134c3e4dbcb0e24139a5e61c5a`), ten exact duplicate subject records, and 591 cross-file AMC 10/12 overlaps were deduplicated, so all 16,022 bundled runtime records are published (`0` `NEEDS_REVIEW`).

The non-AMC audit covers all 13,038 biology, chemistry, Chinese, mathematics, and physics records. It rejects missing stems, answers, or explanations; placeholder and legacy fallback solutions; source-field labels; invalid choice keys; choice questions with fewer than two options, empty options, or non-contiguous option keys; non-choice questions with unexpected options; true/false questions whose answer is not `√` or `×`; answer/solution conclusions that disagree with the stored key; duplicated options; malformed braces, environments, and math delimiters; encoding damage; raw HTML residue; subquestion/answer numbering mismatches; and fill-in-the-blank items missing `______` markers.

The catalog stores 24 accessible SVG diagrams across 21 questions as `GENERATED_REPLACEMENT` assets with `APPROVED` review status (`public/question-assets/generated/zh-CN/<id>/`), including the four-option vertical-angle question (`option-a.svg`..`option-d.svg`) and 20 reviewed `stem.svg` diagrams across biology, chemistry, mathematics, and physics, plus four generated AMC 8 SVG stem diagrams in `public/question-assets/source/amc/`. Practice APIs continue to expose only assets marked `APPROVED`.

The eight nonvisual records previously held for malformed choices are also usable. Compact `A/B/C/D` markers attached directly to Chinese text are parsed deterministically; three source-specific omissions or duplicate labels have reviewed option corrections; and one five-part source record is retained as a written, self-assessed response rather than being misrepresented as a single choice. Two nested source records likewise use reviewed self-assessed parent versions.

## Difficulty calibration

Source difficulty labels are treated as a prior, not ground truth. Every import runs a versioned, grade-relative structural audit over the normalized stem, options, response type, sub-question count, reasoning demands, formula load, and expected response. Each `Question` stores the original label, calibrated score, confidence, reason, and audit version. A disagreement changes the learner-facing level only when confidence is at least 0.8; otherwise the source label is retained for future subject review.

After seeding, run `node --env-file-if-exists=.env --import tsx scripts/audit-question-difficulty.ts` to verify that every row was assessed and to see transition counts and representative corrections. Add `--all` for the complete per-question JSON audit.

The three product levels retain their existing meanings: `EASY` is direct recall or one-step application, `MEDIUM` requires connected concepts or several operations, and `HARD` requires sustained multi-step reasoning, proof, synthesis, or experimental design. Difficulty is relative to the assigned grade; advanced vocabulary alone does not make a question hard.

Audit version 1 assessed all 16,537 bundled questions and changed 5,232 high-confidence mismatches. The calibrated catalog contains 9,123 easy, 4,744 medium, and 2,670 hard questions, replacing the source distribution of 7,605 easy, 7,574 medium, and 1,358 hard. The current counts include the removal of CJEval and legacy subject transport labels and the restoration of damaged prompt structure; the repaired three-result rectangular-prism item now retains its source medium level instead of being treated as a short one-step prompt. AMC difficulty is assigned per contest position (problems 1–10 easy, 11–20 medium, and 21–25 hard) and retained after the structural audit because contest ordering is the stronger source-specific signal. Curated subject review can override an individual result with confidence 1 in `content-curation.ts` without weakening the reproducible default audit.

## AGIEval high-school Chinese

`npm run data:import:agieval` downloads `data/v1_1/gaokao-chinese.jsonl` from pinned AGIEval commit `84ab72d94318290aad2e4ec820d535a95a1f7552`, rejects redirects, limits the response to 5 MB, and verifies SHA-256 `1ddcf8fa15e07a25589796dc1c72a341c2d874af8de41970262d66693f95285f`. The 246 upstream rows contain 33 exact or passage-matched duplicate rows with matching answers. The importer merges those paper references and deterministically emits 213 unique, four-option `高三` questions in `chinese-high-school.json`.

The archive covers 35 named source papers from 2008 through 2021. Of the 213 unique questions, 190 include their reading passage and 23 are standalone language-use questions. All retain the source paper, a stable ID, the upstream commit and file digest, a direct `A`–`D` answer key, and imported high-school Chinese and skill tags. Forty-nine SHA-256-pinned source-row repairs correct confirmed OCR, passage-omission, and grammar damage across the archive. AGIEval does not provide answer explanations; EduLoop says so in every solution entry rather than generating unreviewed reasoning. The upstream `data/v1_1/LICENSE` applies the MIT License to Gaokao data, and its required notice is retained at `data/licenses/agieval-gaokao-mit.txt`.

## CJEval junior-high Chinese

The project owner confirmed a separate permission covering use, modification, learner display, repository redistribution, and commercial use of the CJEval records in EduLoop. The upstream public repository otherwise states an academic/research-only restriction, so evidence of the project-specific permission must be retained outside this repository. Preserve attribution to CJEval and its paper when redistributing the derived archive.

`npm run data:import:cjeval` downloads the three `初中语文` JSONL splits from pinned commit `590fb8f34239f642324b806b68374c303fe643bf`, verifies each source SHA-256 and record count, and deterministically rebuilds `data/zh-CN/chinese.json`. Five irrecoverable passage-less reading records (`b322acd92726ee4475566fea98ca185b`, `369620bbf4863cbc0c99aa7cd3b32cc0`, `e0fb5848cfea070ce51e75cd16f7f075`, `a33ac42806f8c2ef83a188bd99507662`, `0f8838554c65ee5c51d1540eb1944356`) are excluded. The import contains 2,494 questions: 583 source choice questions, 660 fill blanks, 596 modern-reading questions, 653 poetry-appreciation questions, and 2 composite items. All have non-empty answers, explanations, difficulty labels, and one or more knowledge concepts. The 4,095 source knowledge links across 276 distinct labels are imported as stable topic tags.

CJEval does not identify seventh, eighth, or ninth grade, so all records use the honest `初中综合` grade. The converter renders source emphasis markup as visible plain text, formats nested answers for learner self-assessment, removes transport-only labels, restores deterministic section/paragraph/subquestion/option line breaks, applies conservative poetry line formatting, recovers safely delimited and reordered lettered choices, and preserves source split/index provenance. In addition to the upstream row repairs, `scripts/cjeval-repairs.mjs` and `scripts/cjeval-wave4-overrides.mjs` restore 258 classical poems whose upstream CJEval stems had been paraphrased into modern prose back to their canonical classical verse (synchronized with all footnotes and subquestion quotes), reclassify choice and poetry-dictation items to their true types, repair distractor/answer contradictions across 15 additional choice questions, and strip residual section labels (`【答案】`, `【解析】`, `【详解】`, `【分析】`, `【点睛】`) across all subject archives. The import currently produces no `NEEDS_REVIEW` records, but source permission and automated checks do not replace ongoing editorial fact checking.

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
