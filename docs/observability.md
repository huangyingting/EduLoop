# Observability

EduLoop emits structured JSON logs (see [operations](./operations.md)). It also has four opt-in signals.

| Setting | Effect |
| --- | --- |
| `METRICS_TOKEN` (32+ characters) | Enables `GET /api/metrics`, a Prometheus endpoint that requires `Authorization: Bearer <token>`. Without the setting the route returns 404. |
| `ALERT_WEBHOOK_URL` (HTTPS) | Posts a JSON alert to Slack, Teams, or any JSON receiver for every 5xx, at most once per route every 5 minutes. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` (HTTP or HTTPS) | Exports OpenTelemetry traces over OTLP: Next.js route and render spans, outgoing `fetch` calls, and one span per Prisma query. Standard `OTEL_*` variables (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_TRACES_SAMPLER`) apply; `OTEL_SDK_DISABLED=true` turns it off. |
| `SLOW_QUERY_MS` (10–60000) | Logs `slow_database_query` events and counts `eduloop_slow_queries_total` for Prisma queries at or above the threshold. |

`npm run env:check` validates all four.

## Metrics

Each replica reports its own series; aggregate them in Prometheus.

- `eduloop_http_request_duration_ms_{bucket,sum,count}{route,method,status}`: API latency histogram. `route` is the route template, never a raw path, and `status` is a class (`2xx`, `4xx`, `5xx`), so cardinality stays bounded.
- `eduloop_slow_queries_total`: queries over `SLOW_QUERY_MS`.
- `eduloop_build_info{release}` and `eduloop_process_uptime_seconds`.

Example scrape job:

```yaml
scrape_configs:
  - job_name: eduloop
    scheme: https
    metrics_path: /api/metrics
    authorization: { credentials_file: /etc/prometheus/eduloop-metrics-token }
    static_configs: [{ targets: ["learn.example"] }]
```

On the Webstack VM, scrape each container directly on the private Compose network so every replica is counted, rather than through Caddy, which balances across replicas.

- Alert rules: [`observability/prometheus-rules.yml`](./observability/prometheus-rules.yml). They cover the 5xx ratio, p95 latency for question selection and attempt grading, the slow-query rate, and replica scrape failures.
- Grafana dashboard: [`observability/grafana-dashboard.json`](./observability/grafana-dashboard.json). Import it and select the Prometheus data source.

## Alerts and privacy

Webhook alerts and slow-query logs carry only the route template, release, bounded error class or code, request ID, trace ID, duration, and the statement shape. With tracing on, `api_request_completed`, `api_request_failed`, and `request_error` logs include `traceId`, so a log line or alert leads straight to its trace. Prisma statements use placeholders, and parameter values are never logged. Neither signal contains learner identity, request bodies, or exception messages.

## Database

On PostgreSQL, enable `pg_stat_statements` for per-statement history beyond the application's slow-query threshold:

```sql
-- postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms, query
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;
```

## Tracing

Run an OpenTelemetry Collector (or Grafana Alloy) next to the app and point the app at it, for example `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`. The collector forwards to Grafana Tempo, Azure Monitor, or any OTLP backend. Prisma spans carry the statement shape without parameter values. Sample in production to control volume, for example `OTEL_TRACES_SAMPLER=parentbased_traceidratio` with `OTEL_TRACES_SAMPLER_ARG=0.1`.
