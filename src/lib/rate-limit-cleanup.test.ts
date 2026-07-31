import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  upsert: vi.fn(),
  cleanupExpiredSecurityArtifacts: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    rateLimitBucket: {
      deleteMany: mocks.deleteMany,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("./retention", () => ({
  cleanupExpiredSecurityArtifacts: mocks.cleanupExpiredSecurityArtifacts,
}));

import { checkRateLimit } from "./rate-limit";

describe("rate-limit retention cadence", () => {
  beforeEach(() => {
    mocks.deleteMany.mockReset();
    mocks.upsert.mockReset().mockResolvedValue({ count: 1 });
    mocks.cleanupExpiredSecurityArtifacts.mockReset().mockResolvedValue({});
  });

  it("runs the shared expired-artifact cleanup every 250 limiter operations", async () => {
    for (let operation = 1; operation < 250; operation += 1) {
      await checkRateLimit(`cleanup-cadence-${operation}`, 5, 60_000, 1_000);
    }
    expect(mocks.cleanupExpiredSecurityArtifacts).not.toHaveBeenCalled();

    await checkRateLimit("cleanup-cadence-250", 5, 60_000, 1_000);
    expect(mocks.cleanupExpiredSecurityArtifacts).toHaveBeenCalledOnce();
    expect(mocks.cleanupExpiredSecurityArtifacts).toHaveBeenCalledWith(new Date(1_000));
  });
});
