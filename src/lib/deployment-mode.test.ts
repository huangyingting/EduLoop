import { describe, expect, it } from "vitest";
import { registrationEnabled } from "./deployment-mode";

describe("registrationEnabled", () => {
  it("disables registration only for explicit private deployments", () => {
    expect(registrationEnabled({ EDULOOP_PRIVATE_DEPLOYMENT: "true" })).toBe(false);
    expect(registrationEnabled({ EDULOOP_PRIVATE_DEPLOYMENT: "false" })).toBe(true);
    expect(registrationEnabled({})).toBe(true);
  });
});
