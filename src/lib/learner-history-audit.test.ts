import { describe, expect, it } from "vitest";
import { summarizeLearnerHistory } from "./learner-history-audit";

describe("learner history audit", () => {
  it("reports aggregate gaps without learner identity", () => {
    expect(summarizeLearnerHistory([
      { learnerId: "intact", xp: 30, activityAttempts: 3, attemptRows: 3, attemptXp: 30 },
      { learnerId: "pruned", xp: 50, activityAttempts: 6, attemptRows: 2, attemptXp: 20 },
      { learnerId: "empty", xp: 0, activityAttempts: 0, attemptRows: 0, attemptXp: 0 },
    ])).toEqual({
      learnersChecked: 3,
      learnersMissingAttempts: 1,
      missingAttempts: 4,
      learnersWithXpGap: 1,
      xpGap: 30,
    });
  });
});
