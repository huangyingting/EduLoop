// A small in-process metrics registry exposed in Prometheus text format. Each
// replica reports its own counters; the scraper aggregates across replicas.
// Labels are bounded: route templates, methods, and status classes only.

const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

type RequestSeries = {
  route: string;
  method: string;
  statusClass: string;
  count: number;
  durationSumMs: number;
  buckets: number[];
};

const requests = new Map<string, RequestSeries>();
const counters = new Map<string, { name: string; labels: Record<string, string>; value: number }>();
const startedAt = Date.now();

export function statusClass(status: number) {
  return `${Math.floor(status / 100)}xx`;
}

export function recordRequestMetric(route: string, method: string, status: number, durationMs: number) {
  const klass = statusClass(status);
  const key = `${route}\u0000${method}\u0000${klass}`;
  const series = requests.get(key) ?? { route, method, statusClass: klass, count: 0, durationSumMs: 0, buckets: LATENCY_BUCKETS_MS.map(() => 0) };
  series.count += 1;
  series.durationSumMs += durationMs;
  LATENCY_BUCKETS_MS.forEach((bound, index) => {
    if (durationMs <= bound) series.buckets[index] += 1;
  });
  requests.set(key, series);
}

export function incrementCounter(name: string, labels: Record<string, string> = {}, amount = 1) {
  const key = `${name}${JSON.stringify(Object.entries(labels).sort())}`;
  const counter = counters.get(key) ?? { name, labels, value: 0 };
  counter.value += amount;
  counters.set(key, counter);
}

function escapeLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
}

function labelText(labels: Record<string, string>) {
  const entries = Object.entries(labels);
  return entries.length ? `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}` : "";
}

export function renderMetrics(release: string, now = Date.now()) {
  const lines = [
    "# HELP eduloop_build_info Running release.",
    "# TYPE eduloop_build_info gauge",
    `eduloop_build_info${labelText({ release })} 1`,
    "# HELP eduloop_process_uptime_seconds Seconds since this process started serving metrics.",
    "# TYPE eduloop_process_uptime_seconds gauge",
    `eduloop_process_uptime_seconds ${Math.round((now - startedAt) / 1000)}`,
    "# HELP eduloop_http_request_duration_ms API request latency by route template.",
    "# TYPE eduloop_http_request_duration_ms histogram",
  ];
  for (const series of requests.values()) {
    const labels = { route: series.route, method: series.method, status: series.statusClass };
    LATENCY_BUCKETS_MS.forEach((bound, index) => {
      lines.push(`eduloop_http_request_duration_ms_bucket${labelText({ ...labels, le: String(bound) })} ${series.buckets[index]}`);
    });
    lines.push(`eduloop_http_request_duration_ms_bucket${labelText({ ...labels, le: "+Inf" })} ${series.count}`);
    lines.push(`eduloop_http_request_duration_ms_sum${labelText(labels)} ${series.durationSumMs.toFixed(1)}`);
    lines.push(`eduloop_http_request_duration_ms_count${labelText(labels)} ${series.count}`);
  }
  const names = new Set([...counters.values()].map(({ name }) => name));
  for (const name of names) {
    lines.push(`# TYPE ${name} counter`);
    for (const counter of counters.values()) {
      if (counter.name === name) lines.push(`${name}${labelText(counter.labels)} ${counter.value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetrics() {
  requests.clear();
  counters.clear();
}
