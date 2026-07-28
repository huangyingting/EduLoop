export type RepeatTopicObservation = {
  learnerId: string;
  isCorrect: boolean;
  topicSlugs: string[];
};

export function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export function repeatTopicChange(observations: RepeatTopicObservation[], sampled: boolean) {
  const sequences = new Map<string, boolean[]>();
  for (const observation of observations) {
    for (const slug of new Set(observation.topicSlugs)) {
      const key = `${observation.learnerId}\u0000${slug}`;
      const sequence = sequences.get(key) ?? [];
      sequence.push(observation.isCorrect);
      sequences.set(key, sequence);
    }
  }

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  for (const sequence of sequences.values()) {
    if (sequence.length < 2) continue;
    const first = sequence[0];
    const last = sequence.at(-1);
    if (!first && last) improved += 1;
    else if (first && !last) regressed += 1;
    else unchanged += 1;
  }
  const learnerTopicPairs = improved + regressed + unchanged;
  return {
    learnerTopicPairs,
    improved,
    regressed,
    unchanged,
    netChangePoints: learnerTopicPairs ? Math.round(((improved - regressed) / learnerTopicPairs) * 100) : 0,
    sampled,
  };
}
