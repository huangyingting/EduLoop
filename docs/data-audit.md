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
- Two records contain child questions. The current importer retains the parent but marks it for review rather than silently dropping the nested assessment structure.
- The bundle has no linked image/media assets. Explicit figure references, `识图作答题`, and `填图题` records are held for review. Inline choices are recovered only when their `A/B/C...` sequence and content are complete.

Source normalization finds 6,274 questions with high-confidence choice or true/false answer labels; 6,241 of those are published and can be automatically graded. A draft replacement-diagram pilot restores the recorded key and four options for question `8c502ae5d1d18e4743ada96d0adf0ebd`, bringing the imported auto-gradable count to 6,275 while leaving that question in review. The rest use reference-answer self-assessment. Fifty-four records are marked `NEEDS_REVIEW`; 10,295 are eligible for normal practice.

The pilot stores 12 accessible SVG diagrams across nine questions as `GENERATED_REPLACEMENT` assets with `DRAFT` review status. In addition to the four-option vertical-angle question, deterministic stem diagrams cover segment counting, a parallel-line construction, a number-line interval, a parallel-line angle problem, intersecting ellipses, a simple water filter, an ionization smoke detector, and a suspended-lamp force setup. Practice APIs expose only assets marked `APPROVED`, so generated diagrams cannot enter normal practice solely by reseeding the database.

A manual pass over all 44 visual-flagged records classified nine as safely reconstructible (the pilot above), nine as underdetermined, and 26 as not requiring a replacement diagram. The underdetermined records are `a5eae64bf9503c4d88947f680c9f693e`, `8ef70fc5c12b82a2932b987dd151b5f0`, `fa36ed2a96f34272a49ee7666d357dc5`, `b7bde20ca0b30a80ac013b03a0166c45`, `b98ed3fc0c4668aec237c6f23a56fd9b`, `4fbc1823c2841d62cc022d75a57e3970`, `3fc1aa35c10d807252936da125cd20c3`, `df56e384715210fbf368b5be54fbda5c`, and `6fb547240738f3873ca0baebb6ef4c74`; their missing source figures encode details that cannot be recovered reliably from the answer. The remaining 26 are self-contained or have textual options and were caught by broad phrases such as `下列图形` or by a source type such as `识图作答题`; they need review-rule refinement rather than invented artwork.

## Taxonomy strategy

Stable, mutually understood fields are modeled as relations or constrained strings: subject, school stage, grade, difficulty, normalized type, status, and auto-gradability.

Open-ended dimensions use `TagDimension -> Tag -> QuestionTag`:

- `TOPIC`: subject-specific themes such as geometry, mechanics, electrochemistry, or genetics.
- `SKILL`: quantitative reasoning, conceptual reasoning, scientific inquiry, visual interpretation, and real-world application.
- `FORMAT`: choice/written response, LaTeX, multi-part, and auto-graded/self-assessed.

Each question-tag link stores `source` and `confidence`. Current topic/skill tags are deterministic keyword inferences with confidence below 1. Imported structural tags use confidence 1. Teacher-reviewed tags should use `CURATED` with confidence 1 and should take precedence in future ranking.

## Recommended next content work

1. Build a review queue for the held records and any questions students report.
2. Have subject teachers review the highest-volume inferred topics before using them for mastery claims.
3. Add curriculum version, textbook edition, province, and explicit knowledge-point codes as new tag dimensions when that metadata becomes available.
4. Add asset ingestion before accepting future diagram-dependent sources.
5. Introduce semantic duplicate detection; do not deduplicate on exact stem alone.
