// Per-subject ability on the question difficultyScore scale (0 to about 5.5).
// A learner whose rating equals a question's score is expected to answer it
// correctly half the time; each graded result nudges the rating toward the
// evidence, faster while there are few observations.

export const INITIAL_RATING = 1;
const MIN_RATING = 0;
const MAX_RATING = 6;
const EARLY_K = 0.4;
const SETTLED_K = 0.2;
const EARLY_ATTEMPTS = 20;
export const MINIMUM_RATED_ATTEMPTS = 5;

export function expectedSuccess(rating: number, difficultyScore: number) {
  return 1 / (1 + Math.exp(difficultyScore - rating));
}

export function nextRating(rating: number, difficultyScore: number, isCorrect: boolean, priorAttempts: number) {
  const k = priorAttempts < EARLY_ATTEMPTS ? EARLY_K : SETTLED_K;
  const updated = rating + k * ((isCorrect ? 1 : 0) - expectedSuccess(rating, difficultyScore));
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Number(updated.toFixed(4))));
}

// Questions slightly above the current ability keep practice challenging
// without becoming discouraging.
export function targetDifficultyWindow(rating: number) {
  return { min: Math.max(MIN_RATING, rating - 0.75), max: rating + 1 };
}
