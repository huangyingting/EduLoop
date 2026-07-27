export type TopicObservation = {
  slug: string;
  label: string;
  isCorrect: boolean;
  secondsSpent: number | null;
};

export type TopicSignal = {
  slug: string;
  label: string;
  attempts: number;
  accuracy: number;
  averageSeconds: number | null;
  score: number;
};

export function weakestTopic(observations: TopicObservation[], minimumAttempts = 3): TopicSignal | null {
  const topics = new Map<string, { label: string; attempts: number; correct: number; seconds: number; timed: number }>();
  for (const observation of observations) {
    const current = topics.get(observation.slug) ?? { label: observation.label, attempts: 0, correct: 0, seconds: 0, timed: 0 };
    current.attempts += 1;
    current.correct += observation.isCorrect ? 1 : 0;
    if (observation.secondsSpent !== null) {
      current.seconds += observation.secondsSpent;
      current.timed += 1;
    }
    topics.set(observation.slug, current);
  }

  return [...topics.entries()].flatMap(([slug, topic]) => {
    if (topic.attempts < minimumAttempts) return [];
    const accuracy = topic.correct / topic.attempts;
    const averageSeconds = topic.timed ? topic.seconds / topic.timed : null;
    const slowWorkPenalty = averageSeconds === null ? 0 : Math.min(0.15, Math.max(0, averageSeconds - 60) / 600);
    return [{ slug, label: topic.label, attempts: topic.attempts, accuracy, averageSeconds, score: accuracy - slowWorkPenalty }];
  }).sort((left, right) => left.score - right.score || right.attempts - left.attempts || left.slug.localeCompare(right.slug))[0] ?? null;
}
