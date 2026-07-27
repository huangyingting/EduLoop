# Source data audit

Audit date: 2026-07-26. Reproduce the structural portion with `npm run data:audit`.

## Inventory

The four subject-level JSON files contain 10,349 unique question IDs:

| Dimension | Distribution |
| --- | --- |
| School stage | Primary 1,815; middle 4,615; high 3,919 |
| Subject | Mathematics 5,389; physics 2,269; chemistry 1,634; biology 1,057 |
| Difficulty | Easy 5,426; medium 4,725; hard 198 |
| Largest grades | Grade 9: 2,405; high school year 3: 1,647; high school year 1: 1,188 |
| Online-ready flag | True 6,521; false 3,828 |
| Quality label | All 10,349 are labelled `精品`, so this field is not a useful ranking signal yet |

The source has 27 question-type strings. Normalization reduces them to seven stable product families:

| Product family | Questions | Typical source types |
| --- | ---: | --- |
| Single choice | 5,748 | 选择题, 单选题 |
| Fill blank | 2,649 | 填空题, 单空题, 多空题 |
| Written response | 1,115 | 解答题, 简答题, 应用题, 证明题 |
| Multiple choice | 335 | 多选题, 双选题, 不定项选择题 |
| Computation | 234 | 计算题 |
| True/false | 204 | 判断题 |
| Experiment/inquiry | 64 | 实验题, 探究题 and combinations |

## Content and answer quality

- All records use the same outer and nested key shape. Several files start with a UTF-8 BOM; the importer removes it before parsing.
- 6,006 questions have options. Of these, 5,798 have four, 182 have three, 22 have five, and four have two.
- 4,481 stems include `$$...$$`, `\\frac`, or related LaTeX markers and are rendered with KaTeX.
- Every record has non-empty `answer_info.raw_content`; 43 lack a distinct solution/explanation.
- 1,698 records lack `question_info.raw_content.answer1`. This is not treated as an error because many written-response questions keep the answer only in `answer_info`.
- IDs are unique. There are 295 repeated stems, which may represent legitimate grade/source duplication and are retained under their source IDs.
- Two source records contain child questions. Their parent records are retained under the stable source IDs and have reviewed, self-contained written-response versions so both sets of learning objectives remain usable.
- The source bundle has no linked image/media assets. Known figure-dependent records use reviewed textual rewrites or approved generated replacements; unrecognized future figure references remain quarantined by default. Inline choices are recovered only when their `A/B/C...` sequence and content are complete.

Source normalization finds 6,280 questions with high-confidence choice or true/false answer labels. The approved replacement for question `8c502ae5d1d18e4743ada96d0adf0ebd` restores its recorded key and four graphical options, bringing the imported auto-gradable count to 6,281. The rest use reference-answer self-assessment. All 10,349 bundled records are published after curation; no bundled record remains in `NEEDS_REVIEW`.

The catalog stores 12 accessible SVG diagrams across nine questions as `GENERATED_REPLACEMENT` assets with `APPROVED` review status. In addition to the four-option vertical-angle question, reviewed stem diagrams cover segment counting, a parallel-line construction, a number-line interval, a parallel-line angle problem, intersecting ellipses, a simple water filter, an ionization smoke detector, and a suspended-lamp force setup. Practice APIs continue to expose only assets marked `APPROVED`.

A manual pass over all 44 visual-flagged records classified nine as safely reconstructible with diagrams, nine as dependent on unrecoverable source figures, and 26 as not requiring a replacement diagram. The 26 self-contained records use explicit reviewed overrides. The nine unrecoverable visual records were rewritten into equivalent self-contained questions using verbal observations, coordinates, equations, or corrected physical setups; their reviewed stems, answers, and explanations are recorded in `src/lib/content-curation.ts`. The conservative visual rule remains in place for new data.

The eight nonvisual records previously held for malformed choices are also usable. Compact `A/B/C/D` markers attached directly to Chinese text are parsed deterministically; three source-specific omissions or duplicate labels have reviewed option corrections; and one five-part source record is retained as a written, self-assessed response rather than being misrepresented as a single choice. Two nested source records likewise use reviewed self-assessed parent versions.

## Taxonomy strategy

Stable, mutually understood fields are modeled as relations or constrained strings: subject, school stage, grade, difficulty, normalized type, status, and auto-gradability.

Open-ended dimensions use `TagDimension -> Tag -> QuestionTag`:

- `TOPIC`: subject-specific themes such as geometry, mechanics, electrochemistry, or genetics.
- `SKILL`: quantitative reasoning, conceptual reasoning, scientific inquiry, visual interpretation, and real-world application.
- `FORMAT`: choice/written response, LaTeX, multi-part, and auto-graded/self-assessed.

Each question-tag link stores `source` and `confidence`. Current topic/skill tags are deterministic keyword inferences with confidence below 1. Imported structural tags use confidence 1. Teacher-reviewed tags should use `CURATED` with confidence 1 and should take precedence in future ranking.

## Recommended next content work

1. Build an operator review queue for newly quarantined imports and questions students report.
2. Have subject teachers review the highest-volume inferred topics before using them for mastery claims.
3. Add curriculum version, textbook edition, province, and explicit knowledge-point codes as new tag dimensions when that metadata becomes available.
4. Add asset ingestion before accepting future diagram-dependent sources.
5. Introduce semantic duplicate detection; do not deduplicate on exact stem alone.
