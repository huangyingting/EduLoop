# Product and UI design specification

## Product promise

“Every question gives something back.” EduLoop helps a student choose a manageable practice target, attempt one question at a time, receive useful feedback, and see evidence of consistent effort. The primary experience is practice, not browsing a database.

## Audience and modes

- Primary students need larger targets, fewer simultaneous controls, short language, and strong but calm visual feedback.
- Middle school students need fast topic review and enough explanation to diagnose a misconception.
- High school students need precise filtering, dependable formula rendering, and low-friction long-form work.
- Content editors are a protected secondary audience. Their first workflow is report triage, immediate quarantine, and auditable resolution—not a general CMS.

## Core journey

1. Land in the learning hall and see the five subject tracks.
2. Start immediately or filter by school stage, subject, difficulty, topic, skill, and content format.
3. Work on one uncluttered question. The interface states whether one or multiple choices are expected.
4. Submit, then see correctness (where defensible), reference answer, explanation, and XP.
5. Move to a non-repeating next question and complete a ten-question loop.
6. Return later to maintain a daily learning streak and deepen topic mastery.
7. Open a specific saved or scheduled question, review mistakes when due, and graduate an item after three successful spaced reviews.

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

- XP for every honest attempt; more for correct answers and more difficult questions.
- A daily streak for returning, not a public leaderboard; every dashboard uses the same shield-aware projection during a protected gap.
- A session combo for immediate momentum.
- Badges for first practice, a ten-answer correct run, and one hundred attempts.
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

The protected studio shows these as 28-day aggregates. Seven-day return means a learner active 8–14 days ago also practiced in the latest seven-day window. Repeat-topic change compares the first and latest graded result for each learner/topic pair; it is a directional product signal, not a mastery claim. Explanation viewing records one timestamp only after an incorrect attempt and is included in learner export/deletion.

## Current adaptive behavior

Adaptive mode first selects due review items that match the active filters. If none are due, it uses a topic with at least three recent graded attempts inside those filters, combining accuracy with a bounded response-time signal. It then falls back to the learner's lowest-accuracy recently practiced subject, or a filtered random question when evidence is sparse. The reason is shown in plain language. Topic “mastery” remains a recent-performance signal until curriculum tags are teacher-reviewed.
