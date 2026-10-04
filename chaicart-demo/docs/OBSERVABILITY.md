# ChaiCart observability

## Contents

- [Coverage](#coverage)
- [Configuration](#configuration)
- [Correlation and identity](#correlation-and-identity)
- [Metrics](#metrics)
- [Workshop demonstration](#workshop-demonstration)
- [Investigation queries](#investigation-queries)
- [Verification and troubleshooting](#verification-and-troubleshooting)

## Coverage

| Application | Frontend | Application telemetry |
|---|---|---|
| Azure ChaiCart Demo | Dynatrace RUM tag `9d2e601e85292693`; customer and facilitator pages | Node OTel SDK: HTTP, auth, cart, payment pool, simulated gateway/database stages, persistence/fulfillment, logs and runtime/application metrics |
| GitHub Pages workshop | Dynatrace RUM tag `c7e71b371e8cb3b1` on every HTML entrypoint | Static pages have no application backend to instrument |
| Firebase ChaiCart Live | The same RUM tag as the workshop Pages; hash-route navigation and Google user tagging | Browser OTel spans around Firebase SDK operations; protected gateway forwards spans and produces correlated OTel logs/metrics |

The demo is one Node process. Named payment/database/business-system stages are logical components, not separate deployed microservices. The pool is a real in-process concurrency limiter, while database/gateway timings are explicitly simulated. OTel runtime metrics are process metrics, not App Service VM/host monitoring. Problems/alerts require tenant configuration; a scenario does not automatically create a Dynatrace Problem.

Live's reports are marked `telemetry.source=client-observed`. They measure browser-visible SDK latency/outcome, including cache/network effects; they do not trace inside Google's Firestore service. Scores and audit evidence still come from Firestore and the credit ledger. Browser reports can be missing during disconnections or tab closure.

## Configuration

Server-only variables:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=https://indiacs.live.dynatrace.com/api/v2/otlp
DYNATRACE_PLATFORM_TOKEN=<server-side secret>
DEPLOYMENT_ENVIRONMENT=workshop
SERVICE_VERSION=1.1.0
OTEL_METRIC_EXPORT_INTERVAL=15000
```

Export is OTLP/HTTP **protobuf** with gzip. The SDK appends `/v1/traces`, `/v1/metrics` and `/v1/logs` to the base URL. The token uses `Authorization: Bearer …`. Token scopes and the owning user's permissions must both include:

- `openpipeline:traces:ingest`
- `openpipeline:metrics:ingest`
- `openpipeline:logs:ingest`

The `.apps` address is the Dynatrace UI, not the OTLP base URL. Store the token in encrypted App Service configuration or a Firebase Function secret. Never add it to frontend variables, HTML, source control, ZIP files, screenshots, or exported workshop evidence. Unset the endpoint to disable server export. For a local collector, use `http://127.0.0.1:4318` and omit the token.

The supplied RUM tags use beacon `https://bf12470wrz.bf.dynatrace.com/bf`. The demo CSP permits this and the Dynatrace script CDN. RUM-to-OTel linking uses W3C `traceparent` and `tracestate`; same-origin API calls are the default. For a cross-origin gateway, configure **only its URL** in Dynatrace's advanced correlation settings and allow the trace headers on that gateway. Do not enable propagation to arbitrary Google endpoints.

## Correlation and identity

On restored or new Google sessions, call `dtrum.identifyUser(user.email)`. Clear the user tag on sign-out. Pages without sign-in remain anonymous. Signed-in UID and email are attached to backend spans/logs after token verification. Emails are captured with workshop participant consent; credentials and form contents are not captured.

- `trace.id` / `span.id`: OTel context automatically associates logs with active spans. Local evidence uses `trace_id` / `span_id`.
- `request.id`: one HTTP attempt, also returned in `x-request-id`.
- `transaction.id`: one business operation, returned in `x-transaction-id`.
- `order.id`: links checkout to later tracking requests. Each tracking request has a new trace, while retaining the checkout transaction ID.
- `user.id`, `user.email`: verified Firebase identity; never metric dimensions.
- `workshop.session.id`, `workshop.activity.id`: Live context where available.
- `service.name`, `service.version`, `deployment.environment.name`: deployment identity.

Live generates real browser OTel spans and preserves their IDs when forwarding. Transaction reads are child spans of the same transaction; retries stay within the transaction operation. Gateway logs use the imported browser span's trace context and identity derived from the verified token. Gateway HTTP traces also link to the imported operation traces. Reports are allowlisted, size/time bounded, and rate limited. Switched accounts cannot inherit another account's queued telemetry.

## Metrics

| Metric | Unit / meaning |
|---|---|
| `chaicart.http.requests` | Request counter by normalized route, method, status |
| `http.server.request.duration` | Explicit-bucket latency histogram, seconds |
| `http.server.active_requests` | Requests in progress |
| `chaicart.checkout.outcomes` | Success/failure; `sli.good` means successful and under two seconds |
| `chaicart.operation.outcomes` | Pool acquisition and reported Live operation outcomes |
| `chaicart.operation.duration` | Operation latency histogram, seconds |
| `chaicart.payment.pool.capacity`, `.active`, `.waiting` | Pool limit, acquired slots, queued requests |
| `chaicart.fulfillment.backlog`, `.age` | Pending ERP events and oldest pending age in seconds |
| `process.memory.usage`, `nodejs.memory.heap.used` | RSS and used heap, bytes |
| `process.cpu.utilization`, `nodejs.eventloop.delay`, `process.uptime` | Process CPU ratio, loop delay in seconds, uptime |
| `chaicart.telemetry.export.failures`, `.partial_success` | Cumulative exporter health gauges |
| `chaicart.telemetry.dropped_batches` | Queue/drop diagnostic count |

Counters/histograms use delta temporality. IDs/emails are log/span fields, not metric dimensions. INFO dashboard polling logs are suppressed by the OTel request instrumentation. Browser snapshot listeners produce finite initial-load/error/recovery records instead of one infinite span or a log for each update. Queues are bounded; export failures do not block business requests.

## Workshop demonstration

1. Sign in with Google and place an order in healthy mode. Open its trace ID from the receipt. Find the same email in RUM. Follow checkout → pool acquisition → simulated gateway → persistence/fulfillment and inspect correlated logs.
2. Enable **pool exhaustion** and start the facilitator's bounded surge. Compare pool waiting, operation latency, checkout p95 and failures. Inspect a timeout trace: the failed request never reaches the gateway.
3. Roll back to healthy. Confirm waiting drains, checkout succeeds and failures stop.
4. Enable **gateway down**. Show the gateway span failing and the payment error log on the same trace. Confirm the pool is released after failures.
5. Enable **ERP down**. Orders succeed but backlog/oldest age increase. Restore healthy and show the backlog drains.
6. In Live, sign in, join a team and submit an activity. Find the email, Firestore operation, transaction reads and corresponding operation log. Use a controlled rejected operation to inspect `error.type=permission-denied`; do not change production rules just to manufacture a failure.

Suggested dashboard tiles: checkout traffic/outcomes; checkout latency p95; pool active/waiting/capacity; fulfillment backlog/age; Node memory/event-loop delay; Live operation outcomes/duration; recent error logs; recent traces; exporter health. RUM pages show the client experience separately.

## Investigation queries

These are starter DQL queries; validate them against tenant data and permissions before saving dashboard tiles. The ingestion token does not automatically grant query or dashboard-edit access.

Find a participant's logs:

```dql
fetch logs, from: -30m
| filter startsWith(service.name, "chaicart")
| filter user.email == "participant@example.com"
| fields timestamp, content, loglevel, service.name, trace.id, span.id, transaction.id, order.id
| sort timestamp asc
```

Follow a business transaction across requests:

```dql
fetch spans, from: -30m
| filter transaction.id == "REPLACE_WITH_TRANSACTION_ID"
| fields start_time, span.name, service.name, duration, trace.id, span.id, user.email, order.id
| sort start_time asc
```

Show one trace's logs:

```dql
fetch logs, from: -30m
| filter trace.id == toUid("REPLACE_WITH_32_HEX_TRACE_ID")
| fields timestamp, content, loglevel, span.id, transaction.id, user.email
| sort timestamp asc
```

Discover ingested metrics before building tiles:

```dql
metrics from: -1h
| filter startsWith(metric.key, "chaicart.") or metric.key == "http.server.request.duration"
| fields metric.key
```

Pool pressure:

```dql
timeseries {
  active = max(chaicart.payment.pool.active),
  waiting = max(chaicart.payment.pool.waiting),
  capacity = max(chaicart.payment.pool.capacity)
}, filter: { service.name == "chaicart-demo" }
```

## Verification and troubleshooting

- `npm test` in the demo covers existing checkout/outage behavior and a local collector test that independently decodes OTLP protobuf for all signals, checks delta temporality, and verifies concurrent user isolation and RUM trace-context propagation.
- Live's build/lint and full emulator rule suite cover the existing workshop workflow. Gateway validation tests reject oversized/invalid/spoofed payloads and confirm verified identity overrides client input.
- A **401** is invalid/expired authentication; **403** can be a missing signal scope or owning-user permission. Inspect each signal independently: logs working does not prove traces/metrics work.
- A **404** often indicates the UI address was used as an ingest URL. **400/partial success** indicates a rejected payload; check temporality/schema and exporter health.
- RUM has its own ingestion path/configuration. Script load and `dtrum.identifyUser` availability are necessary checks, but do not by themselves prove a session arrived in Dynatrace.
- Do not claim complete ingestion until all three signals are visible in the tenant and a real Google-session request links from RUM to its backend trace.

References: [Dynatrace OTLP endpoints](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api), [token authentication](https://docs.dynatrace.com/docs/dynatrace-api/basics/dynatrace-api-authentication), [frontend/backend linking](https://docs.dynatrace.com/docs/observe/digital-experience/new-rum-experience/web-frontends/additional-configuration/configure-frontend-backend-linking-web), [identifyUser](https://docs.dynatrace.com/javascriptapi/doc/types/dtrum.html).
