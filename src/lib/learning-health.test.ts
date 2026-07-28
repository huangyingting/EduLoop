import { describe, expect, it } from "vitest";
import { percentage, repeatTopicChange } from "./learning-health";

describe("learning health metrics", () => {
  it("uses safe whole percentages", () => {
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(0, 0)).toBe(0);
  });

  it("compares the first and latest result for repeat learner-topic pairs", () => {
    const result = repeatTopicChange([
      { learnerId: "one", isCorrect: false, topicSlugs: ["algebra"] },
      { learnerId: "one", isCorrect: true, topicSlugs: ["algebra"] },
      { learnerId: "two", isCorrect: true, topicSlugs: ["geometry"] },
      { learnerId: "two", isCorrect: false, topicSlugs: ["geometry"] },
      { learnerId: "three", isCorrect: true, topicSlugs: ["algebra", "geometry"] },
      { learnerId: "three", isCorrect: true, topicSlugs: ["algebra", "geometry"] },
    ], false);

    expect(result).toEqual({
      learnerTopicPairs: 4,
      improved: 1,
      regressed: 1,
      unchanged: 2,
      netChangePoints: 0,
      sampled: false,
    });
  });
});
