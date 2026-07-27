import { describe, expect, it } from "vitest";
import { weakestTopic } from "./recommendation";

describe("adaptive topic signals", () => {
  it("prioritizes the weakest sufficiently observed topic", () => {
    expect(weakestTopic([
      { slug: "algebra", label: "代数", isCorrect: true, secondsSpent: 30 },
      { slug: "algebra", label: "代数", isCorrect: true, secondsSpent: 40 },
      { slug: "algebra", label: "代数", isCorrect: false, secondsSpent: 50 },
      { slug: "geometry", label: "几何", isCorrect: false, secondsSpent: 40 },
      { slug: "geometry", label: "几何", isCorrect: false, secondsSpent: 50 },
      { slug: "geometry", label: "几何", isCorrect: true, secondsSpent: 60 },
    ])).toMatchObject({ slug: "geometry", attempts: 3, accuracy: 1 / 3 });
  });

  it("uses slow correct work as a bounded tie-break signal", () => {
    const result = weakestTopic([
      ...Array.from({ length: 3 }, () => ({ slug: "fast", label: "快速", isCorrect: true, secondsSpent: 30 })),
      ...Array.from({ length: 3 }, () => ({ slug: "slow", label: "较慢", isCorrect: true, secondsSpent: 180 })),
    ]);
    expect(result).toMatchObject({ slug: "slow", averageSeconds: 180 });
    expect(result?.score).toBeGreaterThanOrEqual(0.85);
  });

  it("waits for enough evidence", () => {
    expect(weakestTopic([{ slug: "new", label: "新主题", isCorrect: false, secondsSpent: 20 }])).toBeNull();
  });
});
