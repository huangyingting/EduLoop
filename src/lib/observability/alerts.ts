// Sends a compact JSON alert for server errors to ALERT_WEBHOOK_URL (Slack,
// Teams, or any JSON receiver). Alerts carry only the route template, release,
// bounded error class, and request ID, never request data or messages, and
// are throttled per route so an incident cannot flood the channel.

const ALERT_INTERVAL_MS = 5 * 60_000;
const lastAlertAt = new Map<string, number>();

export type ServerErrorAlert = {
  route: string;
  requestId: string;
  status: number;
  errorType?: string;
  errorCode?: string;
};

export function alertWebhookUrl(environment: { ALERT_WEBHOOK_URL?: string } = { ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL }) {
  const value = environment.ALERT_WEBHOOK_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function shouldSendAlert(route: string, now = Date.now()) {
  const last = lastAlertAt.get(route);
  if (last !== undefined && now - last < ALERT_INTERVAL_MS) return false;
  lastAlertAt.set(route, now);
  return true;
}

export function alertPayload(alert: ServerErrorAlert, release: string) {
  const summary = `EduLoop ${alert.status} on ${alert.route} (release ${release})`;
  return {
    text: `${summary}: ${alert.errorType ?? "Error"}${alert.errorCode ? ` ${alert.errorCode}` : ""}, request ${alert.requestId}`,
    event: "eduloop_server_error",
    release,
    ...alert,
  };
}

export async function sendServerErrorAlert(
  alert: ServerErrorAlert,
  release: string,
  fetcher: typeof fetch = fetch,
  url = alertWebhookUrl(),
) {
  if (!url || !shouldSendAlert(alert.route)) return false;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertPayload(alert, release)),
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function resetAlertThrottle() {
  lastAlertAt.clear();
}
