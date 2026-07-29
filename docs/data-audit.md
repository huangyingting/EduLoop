# Source data audit

Audit date: 2026-07-29. Reproduce the structural portion with `node scripts/analyze-data.mjs`.

## Inventory

The seven Simplified Chinese runtime files under `data/zh-CN/` contain 13,812 unique question IDs: four subject-level collections and separate AMC 8, AMC 10, and AMC 12 archives. Matching English AMC source files live under `data/en/`. The AMC files hold 3,463 unique questions representing 3,575 contest slots; 112 exact AMC 10/12 overlaps are stored once with merged paper provenance and solutions.

| Dimension | Distribution |
| --- | --- |
| Grade band | Primary 1,815; middle 4,615; high 3,919; AMC-8 1,025; AMC-10 1,275; AMC-12 1,163 |
| Subject | Mathematics 8,852; physics 2,269; chemistry 1,634; biology 1,057 |
| Difficulty | Easy 6,786; medium 6,118; hard 908 |
| Largest grades | Grade 9: 2,405; high school year 3: 1,647; AMC-10: 1,275 |
| Online-ready flag | True 9,984; false 3,828 |
| Quality label | All 13,812 are labelled `精品`, so this field is not a useful ranking signal yet |

The source has 27 question-type strings. Normalization reduces them to seven stable product families:

| Product family | Questions | Typical source types |
| --- | ---: | --- |
| Single choice | 9,160 | 选择题, 单选题 |
| Fill blank | 2,649 | 填空题, 单空题, 多空题 |
| Written response | 1,117 | 解答题, 简答题, 应用题, 证明题 |
| Multiple choice | 384 | 多选题, 双选题, 不定项选择题 |
| Computation | 234 | 计算题 |
| True/false | 204 | 判断题 |
| Experiment/inquiry | 64 | 实验题, 探究题 and combinations |

## Content and answer quality

- All records use the same outer and nested key shape. Several files start with a UTF-8 BOM; the importer removes it before parsing.
- 9,469 questions have options. Of these, 5,798 have four, 182 have three, 3,485 have five, and four have two.
- 4,577 stems match the structural LaTeX audit. The renderer supports both the original `$$...$$` convention and the AMC archives' `$...$` inline notation.
- Every record has non-empty `answer_info.raw_content`; 43 lack a distinct solution/explanation.
- 1,698 records lack `question_info.raw_content.answer1`. This is not treated as an error because many written-response questions keep the answer only in `answer_info`.
- IDs are unique. There are 319 repeated stems, which may represent legitimate grade/source duplication and are retained under their source IDs. No AMC stem exactly duplicates a stem in the original files, and no exact question fingerprint is duplicated among the AMC files.
- Two source records contain child questions. Their parent records are retained under the stable source IDs and have reviewed, self-contained written-response versions so both sets of learning objectives remain usable.
- The AMC archives contain 1,675 figure references across 1,068 questions, including 688 question prompts. All are stored locally as 1,656 SHA-256-deduplicated files under `public/question-assets/source/amc/`; `manifest.json` retains each original source URL for provenance. The AMC audit rejects remote markers, malformed local markers, and missing files. The original subject files still use reviewed textual rewrites or approved generated replacements; unrecognized future figure references remain quarantined by default. Inline choices are recovered only when their `A/B/C...` sequence and content are complete.

Source normalization finds 9,743 questions with high-confidence choice or true/false answer labels. The approved replacement for question `8c502ae5d1d18e4743ada96d0adf0ebd` restores its recorded key and four graphical options, bringing the imported auto-gradable count to 9,744. The rest use reference-answer self-assessment. All 13,812 bundled records are published after curation; no bundled record remains in `NEEDS_REVIEW`.

The catalog stores 12 accessible SVG diagrams across nine questions as `GENERATED_REPLACEMENT` assets with `APPROVED` review status. In addition to the four-option vertical-angle question, reviewed stem diagrams cover segment counting, a parallel-line construction, a number-line interval, a parallel-line angle problem, intersecting ellipses, a simple water filter, an ionization smoke detector, and a suspended-lamp force setup. Practice APIs continue to expose only assets marked `APPROVED`.

A manual pass over all 44 visual-flagged records classified nine as safely reconstructible with diagrams, nine as dependent on unrecoverable source figures, and 26 as not requiring a replacement diagram. The 26 self-contained records use explicit reviewed overrides. The nine unrecoverable visual records were rewritten into equivalent self-contained questions using verbal observations, coordinates, equations, or corrected physical setups; their reviewed stems, answers, and explanations are recorded in `src/lib/content-curation.ts`. The conservative visual rule remains in place for new data.

The eight nonvisual records previously held for malformed choices are also usable. Compact `A/B/C/D` markers attached directly to Chinese text are parsed deterministically; three source-specific omissions or duplicate labels have reviewed option corrections; and one five-part source record is retained as a written, self-assessed response rather than being misrepresented as a single choice. Two nested source records likewise use reviewed self-assessed parent versions.

## Difficulty calibration

Source difficulty labels are treated as a prior, not ground truth. Every import runs a versioned, grade-relative structural audit over the normalized stem, options, response type, sub-question count, reasoning demands, formula load, and expected response. Each `Question` stores the original label, calibrated score, confidence, reason, and audit version. A disagreement changes the learner-facing level only when confidence is at least 0.8; otherwise the source label is retained for future subject review.

After seeding, run `node --env-file-if-exists=.env --import tsx scripts/audit-question-difficulty.ts` to verify that every row was assessed and to see transition counts and representative corrections. Add `--all` for the complete per-question JSON audit.

The three product levels retain their existing meanings: `EASY` is direct recall or one-step application, `MEDIUM` requires connected concepts or several operations, and `HARD` requires sustained multi-step reasoning, proof, synthesis, or experimental design. Difficulty is relative to the assigned grade; advanced vocabulary alone does not make a question hard.

Audit version 1 assessed all 13,812 bundled questions and changed 4,088 high-confidence mismatches while retaining 9,724 source labels. The calibrated catalog contains 8,413 easy, 4,031 medium, and 1,368 hard questions, replacing the source distribution of 6,786 easy, 6,118 medium, and 908 hard. AMC difficulty is assigned per contest position (problems 1–10 easy, 11–20 medium, and 21–25 hard) and retained after the structural audit because contest ordering is the stronger source-specific signal. Curated subject review can override an individual result with confidence 1 in `content-curation.ts` without weakening the reproducible default audit.

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
