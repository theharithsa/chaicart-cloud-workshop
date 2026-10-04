# ChaiCart workshop demo

A runnable companion to [the two-day ChaiCart workshop](https://github.com/theharithsa/chaicart-cloud-workshop). Node.js 24, plain HTML/CSS/JS, Firebase Admin SDK for protected facilitator access. Workshop materials live in the repository root (`../`).

**Azure demo:** [Storefront](https://chaicart-workshop-vh-20261003.azurewebsites.net/) · [Facilitator console](https://chaicart-workshop-vh-20261003.azurewebsites.net/facilitator). Sign in with Google to order; facilitator controls require an existing Firestore admin entry. See the [deployed environment and redeployment notes](docs/DEPLOYMENT.md#workshop-azure-environment).

## Customer ordering

Customers sign in with Google using the same Firebase project. Customer accounts do not need an admin document. Checkout, order history and tracking are protected by server-verified UID ownership. Filter coffee is included alongside chai and snacks. In the explicit local-token rehearsal mode below, click **Sign in (demo)** to obtain a simulated customer session.

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
| `FIREBASE_SERVICE_ACCOUNT_JSON` | unset | Backend-only service-account JSON; supports resolved Azure Key Vault references and takes precedence over ADC |
| `DATA_DIR` | data | Order / event storage |
| `POOL_TIMEOUT_MS` | 30000 | Connection acquisition timeout |
| `GATEWAY_DELAY_MS` | 205 | Simulated external call duration |
| `DYNATRACE_PLATFORM_TOKEN` | unset | Server-only Dynatrace token with all three ingest permissions (legacy setting name) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | OTLP/HTTP protobuf base URL; exports traces, logs and metrics |

## Azure deployment

The app is in `chaicart-demo/` within this repository. GitHub Pages serves only the workshop materials. The root [demo workflow](../.github/workflows/chaicart-demo.yml) tests this subdirectory and deploys only that directory to Azure.

1. In Azure Portal create a dedicated resource group, e.g. `rg-chaicart-workshop`, in Central India. Create a Linux App Service using Node 24 LTS and a Basic B1 plan for the crowd demo; rehearse capacity rather than assuming 120 simultaneous visitors will fit the Free plan. Use one instance.
2. Configure [Firebase sign-in](docs/AUTHENTICATION.md), `DATA_DIR=/home/chaicart-data`, and `SCM_DO_BUILD_DURING_DEPLOYMENT=true` in App Service environment variables. Set startup command `npm start` and use HTTPS for participants. The `.deployment` file enables remote build for source ZIP deployments.
3. Deploy this folder using the root workflow in `.github/workflows/chaicart-demo.yml`. For this workflow set repository variable `AZURE_WEBAPP_NAME` and create the GitHub environment `workshop` with secret `AZURE_WEBAPP_PUBLISH_PROFILE`. The deploy job waits for tests; it is skipped when no app name is configured. Publish profiles require SCM basic authentication; prefer your organization's OIDC deployment setup when it is available. Keep credentials out of the repository.
4. Enable Application Insights on the app, then restart. Follow the [official App Service monitoring guide](https://learn.microsoft.com/en-us/azure/app-service/monitor-app-service) for the Node agent; verify request telemetry and Live Metrics in your actual tenant. Local structured console logs are not automatically guaranteed to appear in Application Insights Logs.
5. Open the public URL repeatedly and `/chai-not-found` to generate 404s. In Application Insights use `requests | summarize count() by resultCode, bin(timestamp, 1m)`; workspace-based queries can use `AppRequests | summarize count() by ResultCode, bin(TimeGenerated, 1m)`.
6. Configure the workshop's budget alert at 80% in Cost Management. Budget alerts notify; they do not stop spending.
7. Generate a QR code from the deployed HTTPS URL. Test it on a phone on mobile data.
8. After the workshop, inspect and delete the dedicated resource group in Portal. Confirm the app, App Service plan and monitoring resources are included; don't delete shared resources.

The Azure app was deployed on 3 October 2026. Health, menu, Firebase web configuration, storefront/facilitator rendering, rejection of signed-out protected requests, and disabled local demo login were verified. Google sign-in and authenticated ordering/facilitator actions still require a live rehearsal on the Azure hostname. Crowd capacity and external telemetry ingestion remain unverified.

## Dynatrace / OpenTelemetry

The Node OTel SDK exports authenticated, batched OTLP/HTTP protobuf traces, correlated logs, delta counters and explicit-bucket histograms. Runtime metrics cover the Node process. Payment/database/business-system spans are explicitly logical/simulated components, not separate deployed services or a real PostgreSQL instance.

Set `OTEL_EXPORTER_OTLP_ENDPOINT=https://indiacs.live.dynatrace.com/api/v2/otlp` and put `DYNATRACE_PLATFORM_TOKEN` in protected server configuration. Classic `dt0c01` tokens use `Api-Token` authentication; platform tokens use `Bearer` and require the owning user and token to have all three signal permissions. The legacy setting name accepts either type; `DYNATRACE_TOKEN` is also supported. RUM tags are installed on customer/facilitator pages and identify Google users by email. No token is shipped to the browser. Export queues/timeouts are bounded and business requests do not wait for exports.

See [the observability runbook](docs/OBSERVABILITY.md) for identity, transaction correlation, metrics, DQL queries, demo sequence and verification. OneAgent/cloud monitoring and alert configuration are still needed for host/infra-specific worksheet questions and automatic Problems; OTel application instrumentation alone does not prove those.

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
