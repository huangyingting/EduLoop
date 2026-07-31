import { afterEach, describe, expect, it, vi } from "vitest";
import { deferInitialization } from "./deferred-initialization";

describe("deferInitialization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes from the surviving effect after a Strict Mode replay", () => {
    vi.useFakeTimers();
    const initialized = { current: false };
    const initialize = vi.fn();

    const cancelFirstEffect = deferInitialization(initialized, initialize);
    cancelFirstEffect();
    deferInitialization(initialized, initialize);
    vi.runAllTimers();

    expect(initialize).toHaveBeenCalledOnce();
    expect(initialized.current).toBe(true);
  });

  it("exposes when initialization is canceled during asynchronous work", () => {
    vi.useFakeTimers();
    const initialized = { current: false };
    let isActive = () => false;
    const cancel = deferInitialization(initialized, (currentIsActive) => {
      isActive = currentIsActive;
    });

    vi.runAllTimers();
    expect(isActive()).toBe(true);
    cancel();
    expect(isActive()).toBe(false);
  });
});
