import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertPayload, alertWebhookUrl, resetAlertThrottle, sendServerErrorAlert, shouldSendAlert } from "./alerts";

describe("server error alerts", () => {
  beforeEach(() => resetAlertThrottle());

  it("accepts only HTTPS webhooks", () => {
    expect(alertWebhookUrl({ ALERT_WEBHOOK_URL: "https://hooks.example/a" })).toBe("https://hooks.example/a");
    expect(alertWebhookUrl({ ALERT_WEBHOOK_URL: "http://hooks.example/a" })).toBeNull();
    expect(alertWebhookUrl({})).toBeNull();
  });

  it("throttles repeated alerts per route", () => {
    expect(shouldSendAlert("GET /api/a", 0)).toBe(true);
    expect(shouldSendAlert("GET /api/a", 60_000)).toBe(false);
    expect(shouldSendAlert("GET /api/b", 60_000)).toBe(true);
    expect(shouldSendAlert("GET /api/a", 6 * 60_000)).toBe(true);
  });

  it("sends only bounded metadata", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const sent = await sendServerErrorAlert(
      { route: "POST /api/attempts", requestId: "req-1", status: 500, errorType: "TypeError" },
      "release-1",
      fetcher as unknown as typeof fetch,
      "https://hooks.example/alert",
    );
    expect(sent).toBe(true);
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual(alertPayload({ route: "POST /api/attempts", requestId: "req-1", status: 500, errorType: "TypeError" }, "release-1"));
    expect(body.text).toContain("EduLoop 500 on POST /api/attempts (release release-1)");
  });
});
