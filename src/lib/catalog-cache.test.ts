import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { catalogRelease: { findFirst } } }));

import { cachedCatalogValue, invalidateCatalogCache } from "./catalog-cache";

describe("catalog cache", () => {
  beforeEach(() => {
    invalidateCatalogCache();
    findFirst.mockReset().mockResolvedValue({ manifestHash: "release-a" });
  });

  it("reuses a value for the same release until it expires", async () => {
    const loader = vi.fn(async () => ({ subjects: 5 }));
    await expect(cachedCatalogValue("home", loader, 1_000)).resolves.toEqual({ subjects: 5 });
    await expect(cachedCatalogValue("home", loader, 2_000)).resolves.toEqual({ subjects: 5 });
    expect(loader).toHaveBeenCalledOnce();
    await cachedCatalogValue("home", loader, 1_000 + 6 * 60_000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("reloads when a new catalog release becomes live", async () => {
    const loader = vi.fn(async () => "value");
    await cachedCatalogValue("filters", loader, 1_000);
    findFirst.mockResolvedValue({ manifestHash: "release-b" });
    await cachedCatalogValue("filters", loader, 40_000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("drops failed loads and clears on invalidation", async () => {
    const failing = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    await expect(cachedCatalogValue("broken", failing, 1_000)).rejects.toThrow("database unavailable");
    const recovered = vi.fn(async () => "ok");
    await expect(cachedCatalogValue("broken", recovered, 1_001)).resolves.toBe("ok");

    invalidateCatalogCache();
    await cachedCatalogValue("broken", recovered, 1_002);
    expect(recovered).toHaveBeenCalledTimes(2);
  });
});
