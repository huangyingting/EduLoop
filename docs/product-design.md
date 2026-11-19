# Product and UI design specification

## Product promise

“Every question gives something back.” EduLoop helps a student choose a manageable practice target, attempt one question at a time, receive useful feedback, and see evidence of consistent effort. The primary experience is practice, not browsing a database.

## Audience and modes

- Primary students need larger targets, fewer simultaneous controls, short language, and strong but calm visual feedback.
- Middle school students need fast topic review and enough explanation to diagnose a misconception.
- High school students need precise filtering, dependable formula rendering, and low-friction long-form work.
- Content editors are a protected secondary audience. Their first workflow is report triage, immediate quarantine, and auditable resolution—not a general CMS.

## Core journey

1. Land in the learning hall and see the <!-- stat:seed.subjects -->5<!-- /stat --> subject tracks.
2. Start immediately or filter by school stage, subject, difficulty, topic, skill, and content format.
3. Work on one uncluttered question. The interface states whether one or multiple choices are expected.
4. Before answering, reveal question-specific hints one step at a time, or a clearly labeled generic "解题策略" when the question has none. Then submit and see correctness (where defensible), reference answer, explanation, and XP.
5. Move to a non-repeating next question and complete a ten-question loop.
6. Return later to maintain a daily learning streak and deepen topic mastery.
7. Open a specific saved or scheduled question, review mistakes when due (after 1, 3, and 7 days), and graduate an item after three successful spaced reviews. A graduated item returns for long-term checks after 30 days, then 60, up to 180. A miss sends it back to active review.

## Information architecture

- **Learning hall:** daily target, start CTA, subject tracks, platform coverage, and reward framing.
- **Practice:** filters, ten-question progress, question, answer interaction, feedback, and explanation.
- **Growth:** 28-day activity calendar, recent subject accuracy, weak-topic radar, recent mistakes, sessions, and badges.
- **Review:** due mistake queue, saved questions, and a 1/3/7-day mastery schedule.
- **Content studio:** role-protected learner-report triage, full question context, immediate quarantine, and an action history. Import batches, tag curation, media, and publishing remain later extensions.

## Visual direction

The visual language is “curious workshop”: warm paper canvas, dark ink outlines, lavender as the main action color, lime for earned progress, coral for corrective feedback, and deliberately rounded geometry. Offset hard shadows make controls feel tangible without copying a toy interface.

Key tokens:

| Role | Token |
| --- | --- |
| Canvas | `#f4f1e9` |
| Ink | `#242136` |
| Primary | `#6c5ce7` |
| Progress | `#d9f99d` |
| Correct | `#2c9b73` |
| Correction | `#f06d5f` |
| Corner radius | 12px controls; 22-36px cards/regions |
| Depth | 4-9px opaque offset shadows, never blurry glass everywhere |

Chinese system fonts are preferred to avoid a font download blocking first paint. Formulas use KaTeX. Motion is limited to reward entry, hover lift, and decorative hero orbits; `prefers-reduced-motion` disables it.

## Reward design

Rewards reinforce behavior a student controls:

- XP for every honest attempt; more for correct answers and more difficult questions. Self-assessed written work earns a flat amount, so claiming a written answer was correct earns nothing extra. The rules live in `src/lib/practice/rewards.ts` under `REWARD_RULES_VERSION`.
- A daily streak for returning, not a public leaderboard; every dashboard uses the same shield-aware projection during a protected gap. The streak day follows the learner's stored time zone. The first attempt records the device zone, and the learner can change it on the profile page at most once every 24 hours, so switching zones cannot manufacture extra days.
- A session combo for immediate momentum.
- Data-driven badges: each `Badge` row stores a JSON rule (`TOTAL_ATTEMPTS`, `CORRECT_RUN`, `STREAK_DAYS`, `MASTERED_TOPICS`, `SUBJECT_ATTEMPTS`). The bundled set in `src/lib/practice/badge-catalog.ts` covers first practice, a ten-answer correct run, one hundred attempts, 3/7/30-day streaks, and the first and fifth mastered topic. A mastered topic means at least five graded attempts at 80% accuracy or better. Adding a badge means adding an entry and running the seed.
- Ten-question progress gives sessions a clear end.

Avoid competitive rank, punishment language, XP loss, and deceptive urgency. A wrong answer is framed as a clue and always paired with an explanation where available. A streak shield absorbs one missed day so a short interruption does not feel catastrophic.

## Accessibility and safety

- Target WCAG 2.2 AA contrast and 44px pointer targets.
- Never rely on color alone: answer states also use icons and text.
- Preserve keyboard focus and native select/textarea behavior.
- Formula failures display source text in KaTeX’s configured error color rather than hiding content.
- No public profiles or social comparison for minors by default.
- Guest practice creates no device ID or durable learning record. Public persistent accounts are limited to adult learners or parents/legal guardians and require versioned terms/privacy acceptance. School roster deployments still need verified guardian or institutional consent, teacher controls, and jurisdiction-specific retention before collecting student data.

## Product success measures

Start with learning-loop health rather than time-on-site: practice starts, questions completed per started session, explanation-open rate after incorrect attempts, seven-day return rate, and topic-level improvement on repeat exposure. Audit answer disputes and question reports as a first-class quality metric.

The protected studio shows these as 28-day aggregates. Seven-day return means a learner active 8–14 days ago also practiced in the latest seven-day window. Repeat-topic change compares the first and latest graded result for each learner/topic pair; it is a directional product signal, not a mastery claim. Explanation viewing records one timestamp only after an incorrect attempt and is included in account export and learning-data deletion.

## Selection, contests, and browsing

- **Unseen first.** A signed-in learner gets questions they have never attempted within the active filters. When those run out, they get questions still in active review, and only then repeats. Guests keep the in-session exclusion list.
- **Difficulty targeting.** Each graded result updates a per-subject Elo-style rating on the `difficultyScore` scale (`src/lib/practice/ability.ts`). After five graded attempts in scope, adaptive mode prefers questions from about 0.75 below to 1.0 above the rating, unless the learner chose a difficulty.
- **Contest mode** (`/contest`). All <!-- stat:seed.contestPapers -->143<!-- /stat --> AMC 8/10/12 papers (including AJHSME, the 2002 practice papers, and the 2021 Fall sitting) are rebuilt from source provenance. A learner takes one timed paper at a time (40 minutes for AMC 8, 75 for AMC 10/12). Answers autosave, and nothing is graded until submission or the deadline. Scoring follows AMC rules: 6 per correct answer and 1.5 per blank for AMC 10/12, 1 per correct answer for AMC 8. The report breaks results down by topic. Each answered problem is recorded as a normal attempt, so XP, streaks, statistics, and mistake review all apply; resubmitting never double-counts.
- **History and browsing.** Question cards show the learner's own earlier attempts ("做过 N 次 · 上次答对"), with the full list one click away after answering. `/browse` lists questions by filter or by contest paper without answers, and links each one into practice.

## Current adaptive behavior

Adaptive mode first selects due review items that match the active filters. If none are due, it uses a topic with at least three recent graded attempts inside those filters, combining accuracy with a bounded response-time signal. It then falls back to the learner's lowest-accuracy recently practiced subject, or a filtered random question when evidence is sparse. The reason is shown in plain language. Topic “mastery” remains a recent-performance signal until curriculum tags are teacher-reviewed.

## Hints

Hints live in `QuestionHint`. The catalog import derives conservative hints from source solutions (`src/lib/hint-derivation.ts`):

- a "这道题考查：…" focus statement for any subject whose solution states what it tests;
- for AMC sources, the setup of the first solution sentence, clipped before the first computation or conclusion cue.

Anything naming an option, a conclusion, or the answer text is dropped. Derived hints are rebuilt on every import; `CURATED` hints from editors survive imports. Only `APPROVED` hints are served, and `hasHint` is true only when one exists. Attempts record `hintsUsed`: a correct answer after hints earns half the difficulty bonus, and keeps a due review item in active review instead of advancing it. The studio's learning-health panel reports hint usage and accuracy after hints.

## Reminders and offline use

Reminder email is opt-in, off by default, and limited to waking hours in the learner's own time zone. EduLoop is installable as a progressive web app: a manifest with standard and maskable icons, and a service worker (production only). The worker caches static assets and an offline page, and never caches API responses or personal pages. A navigation without network shows the offline page instead of a browser error.

## Classes and assignments

Learners join a class from **My classes** (`/classes`) with the code their teacher shares; a guardian can join on behalf of the child profile currently practicing. The join form says exactly what the teacher will see: nickname, assignment progress, and class-wide topic results. Each assignment links straight into filtered practice or the assigned contest paper and shows progress toward its goal and due date.

Teachers use the **Teacher workspace** (`/teach`) to create and archive classes, rotate join codes, set assignments (practice filters and a question goal, or a contest paper), remove members, and read a progress table and a class topic heatmap. Progress is computed from attempts made after an assignment was set and before it was due, so nothing extra is stored about learners.
