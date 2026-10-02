# ChaiCart workshop demo

A runnable companion to [the two-day ChaiCart workshop](https://github.com/theharithsa/chaicart-cloud-workshop). Node.js 24, plain HTML/CSS/JS, Firebase Admin SDK for protected facilitator access. Workshop materials live in the repository root (`../`).

## Facilitator access

The deployed console uses Google sign-in and the existing ChaiCart Live Firestore `admins/{email}` list. See [Firebase authentication setup](docs/AUTHENTICATION.md). Firebase is the default auth mode and fails closed when unconfigured. The quick start below explicitly selects the local shared-token fallback for offline rehearsal.

## Run locally

Prerequisite: Node.js 24 LTS and npm. Clone the repository, then run:

```bash
git clone https://github.com/theharithsa/chaicart-cloud-workshop.git
cd chaicart-cloud-workshop/chaicart-demo
npm ci
npm test
export AUTH_MODE="local-token"
export ADMIN_TOKEN="choose-a-local-token"
npm start
```

On PowerShell, set `$env:AUTH_MODE="local-token"` and `$env:ADMIN_TOKEN="choose-a-local-token"` before `npm start`. On either platform, you can generate a random token with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Open http://localhost:8080 and http://localhost:8080/facilitator. Enter the token in the facilitator console. In local-token mode, no token means the facilitator APIs are disabled. In Firebase mode, only verified Google accounts in the shared admin list are allowed. Tokens stay in browser memory; disconnect when projecting the storefront. Never use the local preview token on a public deployment.

## Workshop mapping

| Workshop moment | Demo |
| --- | --- |
| Day 1: PaaS | Deploy this same Node app to Azure App Service |
| VM / container race | Dockerfile packages the same storefront; the original workshop uses ACI's hello-world image |
| Architecture Lego / Human Kitchen | Follow checkout → cart → payment → pool → demo DB → demo gateway; inspect the trace |
| Observability introduction | Open facilitator metrics, structured logs and request waterfalls; optionally export traces to a collector |
| Day 2: Who Killed Checkout? | Start healthy, deploy pool 50 → 5, run surge, watch waits / 504s, roll back |
| Treasure hunt | Phone traffic at `/`; `/chai-not-found` returns a real 404; cloud telemetry setup below |
| SRE / error budget | Rolling 60s checkout SLI: successful and under 2s; objective 99.9% |
| CI/CD | Tests gate deployment; change storefront title, then deliberately fail a test in a rehearsal branch |
| Follow the Order | Pause ERP, place orders; CRM/SCM/HCM/BI continue and invoices queue; recovery replays |
| Demo Day | Participants order from phones while you explain the architecture and incident |

The paper games, quizzes, scoring, cost-budget exercise, and investigation evidence remain in the original workshop site. This app accompanies them.

## Rehearsal sequence

1. Start healthy. Place an order; inspect its trace ID and 5 business events.
2. Run the surge while healthy for a baseline. Allow pending requests to drain.
3. Select **Deploy Dave: pool 50 → 5**, then start the surge (60 checkouts/sec for 45 seconds). The pool really limits concurrent work. Waiting rises; sufficiently queued requests time out after 30 seconds. The failed trace has a pool-wait span and no gateway span. Menu requests still work.
4. Roll back while traffic runs: pool returns to 50 and waiting work drains. Stop new traffic. A browser may throttle background tabs; use `npm run load` on the presenter machine for reproducible traffic.
5. Export evidence before disconnecting. Telemetry is bounded in memory and resets on restart.
6. Show a separate gateway failure: failed traces reach PayFast, distinguishing it from pool starvation.
7. Pause ERP, order chai, show queued ERP events alongside successful CRM/SCM/HCM/BI events. Select healthy to replay.

This reproduces the *mechanism*, not the printed mystery's exact 38% success rate, timestamps or Hikari/Java logs. Actual results depend on traffic and machine speed. Do not present the printed simulated CPU/disk/cache values as live measurements from this app.

## Architecture and limits

One process implements instrumented logical services. It is **not independently deployed microservices**. Database delays, gateway charges and business-system effects are simulated; pool waiting, response codes, request durations, order storage and invoice replay are real. No payments, deliveries, SaaS integrations, PostgreSQL or Redis are contacted.

Order state is stored atomically in `data/state.json` (up to 1,000 orders / 3,000 events). This is a single-instance teaching app: do not scale replicas against this file. For a true multi-zone exercise, replace storage with a shared database and the event list with a durable broker before scaling. Payment retries are not idempotent; a repeated request may create another demo order. Delivery advances in 30 seconds for presentation purposes.

## Additional guides

- [Facilitator runbook](docs/FACILITATOR.md): timed demo sequence, evidence, recovery, and preflight.
- [Deployment decision and setup](docs/DEPLOYMENT.md): Azure recommendation, Firebase/Cloud Run constraints, pipeline settings and troubleshooting.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 8080 | HTTP port |
| `AUTH_MODE` | firebase | Google/admin sign-in; local-token for explicit offline rehearsal |
| `ADMIN_TOKEN` | unset | Local-token mode only |
| `FIREBASE_*` | unset | Shared live-project web configuration; see authentication guide |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset | Backend credential-file path, or use application default workload identity |
| `DATA_DIR` | data | Order / event storage |
| `POOL_TIMEOUT_MS` | 30000 | Connection acquisition timeout |
| `GATEWAY_DELAY_MS` | 205 | Simulated external call duration |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | OpenTelemetry Collector base URL (HTTP JSON /v1/traces) |

## Azure deployment

The app is in `chaicart-demo/` within this repository. GitHub Pages serves only the workshop materials. The root [demo workflow](../.github/workflows/chaicart-demo.yml) tests this subdirectory and deploys only that directory to Azure.

1. In Azure Portal create a dedicated resource group, e.g. `rg-chaicart-workshop`, in Central India. Create a Linux App Service using Node 24 LTS and a Basic B1 plan for the crowd demo; rehearse capacity rather than assuming 120 simultaneous visitors will fit the Free plan. Use one instance.
2. Configure [Firebase sign-in](docs/AUTHENTICATION.md) and set `DATA_DIR=/home/chaicart-data` in App Service environment variables. Set startup command `npm start` and use HTTPS for participants.
3. Deploy this folder using the root workflow in `.github/workflows/chaicart-demo.yml`. For this workflow set repository variable `AZURE_WEBAPP_NAME` and create the GitHub environment `workshop` with secret `AZURE_WEBAPP_PUBLISH_PROFILE`. The deploy job waits for tests; it is skipped when no app name is configured. Publish profiles require SCM basic authentication; prefer your organization's OIDC deployment setup when it is available. Keep credentials out of the repository.
4. Enable Application Insights on the app, then restart. Follow the [official App Service monitoring guide](https://learn.microsoft.com/en-us/azure/app-service/monitor-app-service) for the Node agent; verify request telemetry and Live Metrics in your actual tenant. Local structured console logs are not automatically guaranteed to appear in Application Insights Logs.
5. Open the public URL repeatedly and `/chai-not-found` to generate 404s. In Application Insights use `requests | summarize count() by resultCode, bin(timestamp, 1m)`; workspace-based queries can use `AppRequests | summarize count() by ResultCode, bin(TimeGenerated, 1m)`.
6. Configure the workshop's budget alert at 80% in Cost Management. Budget alerts notify; they do not stop spending.
7. Generate a QR code from the deployed HTTPS URL. Test it on a phone on mobile data.
8. After the workshop, inspect and delete the dedicated resource group in Portal. Confirm the app, App Service plan and monitoring resources are included; don't delete shared resources.

Azure deployment and telemetry ingestion have not been executed or verified by this local build.

## Dynatrace / OpenTelemetry

The app can export its logical traces as OTLP HTTP JSON to an OpenTelemetry Collector. It doesn't export host metrics or a real PostgreSQL service; use an instrumented environment/OneAgent for the worksheet's host CPU and Problems questions. A Dynatrace Problem is not guaranteed simply by injecting this fault.

Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318`. Configure the collector's OTLP HTTP receiver and a traces pipeline forwarding to your tenant using Dynatrace's supported OTLP exporter configuration. See [Dynatrace's OpenTelemetry Collector guide](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/collector). Keep the Dynatrace token in the collector's environment, never in the browser. The exporter is best effort and does not retry; rehearse ingestion and sampling before the workshop. JSON console logs need a separate log ingestion pipeline for DQL. No external telemetry is sent unless an exporter endpoint is set.

For the workshop's real service map and incoming/outgoing network calls, deploy separate services and propagate W3C trace context, or use your existing instrumented environment. The local waterfall is a fallback teaching view, not evidence of network-distributed services.

## Container

```bash
docker build -t chaicart .
docker run --rm -p 8080:8080 -e AUTH_MODE=local-token -e ADMIN_TOKEN -v chaicart-data:/app/data chaicart
```

Export `ADMIN_TOKEN` in your shell before the run. Docker execution has not been verified here.

## Validation

`npm test` checks pricing, input validation, protected APIs / order lookup, restart persistence, pool exhaustion / rollback, gateway recovery and ERP queue replay. Tests shorten the pool timeout to make failures deterministic. The browser flow also verifies add-to-cart and checkout.

## License

MIT, inherited from the [repository license](../LICENSE).
