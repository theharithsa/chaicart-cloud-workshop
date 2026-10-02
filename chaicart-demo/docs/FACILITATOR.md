# Facilitator runbook

Use with the original facilitator guide and slides in the repository root. This app supplements the paper games; it doesn't replace scoring, architecture posters or the murder-mystery envelopes.

## Before participants arrive

- Run `npm ci` and `npm test` in `chaicart-demo/`, then configure [Firebase sign-in](AUTHENTICATION.md), or explicitly select `AUTH_MODE=local-token` with a fresh `ADMIN_TOKEN` for an offline rehearsal. A local demo needs Node 24. A public demo needs HTTPS and configured Firebase admin authorization.
- Open storefront and `/facilitator` in separate tabs. Sign into the console. Don't project the token entry or copy the token into slides.
- Confirm normal checkout, menu, tracking and `/chai-not-found` (404). All prices/payments/deliveries are demonstration data.
- Rehearse the load generator at the final deployed URL. Have Azure/Dynatrace signed in, with request ingestion already confirmed. Prepare a QR code and phone test.
- Save screenshots/recordings for unreliable Wi-Fi. The original slides and games work offline; this storefront still requires its backend.

## Day 1: build and trace an order (5–10 minutes)

1. Explain the browser → Node app → simulated dependencies. Show the Azure deployment for PaaS and Dockerfile for portability.
2. Order two cups and a samosa. Show server-calculated total and the request receipt's trace ID.
3. Open the console trace: cart validation → payment → pool acquisition → demo DB → gateway → business events. Expand the most recent trace.
4. Relate each span to the Human Kitchen station. Be explicit that these are logical services within one process; separate deployment and HTTP context propagation are a later extension.
5. Show five business effects: CRM, SCM, HCM, BI and ERP. Delivery advances in 30 seconds for the demo, despite the storefront's 10-minute promise.

## Day 2: Who Killed Checkout? live companion (5–8 minutes)

The printed evidence has fixed numbers/timestamps; the app reproduces the bottleneck mechanism, not that exact dataset. Don't expose the live fault control while students are solving their envelopes.

1. Set **Healthy / Roll back**. Generate a short normal-traffic baseline or place a few orders.
2. Set **Deploy Dave: pool 50 → 5**. Show the change timeline after the paper investigation reveal.
3. Start **Launch surge**: 60 checkout attempts/second for 45 seconds. Pool slots stay held across the 205ms simulated gateway call. With five slots, demand exceeds throughput and waiting grows.
4. After enough queueing, 30-second acquisition timeouts return real 504 responses. Compare metrics, error logs and failed trace spans. A pool-timeout trace never reaches PayFast; the menu can still load.
5. Select **Healthy / Roll back** while traffic is active. Capacity expands to 50 and the queue drains. Stop new traffic. Requests already waiting continue until resolved or timed out.
6. Export evidence before restarting the server or disconnecting. Retention is bounded, and the console displays only the most recent traces/logs.

If the browser throttles traffic in a background tab, run the CLI generator from `chaicart-demo/`:

```bash
BASE_URL=https://your-app.azurewebsites.net RATE=60 SECONDS=45 npm run load
```

On PowerShell, set `$env:BASE_URL`, `$env:RATE` and `$env:SECONDS` first. The tool creates demo orders at the chosen destination; run it only against your workshop app. It waits for pending requests after the sending interval ends.

## Distinguish a gateway outage (2 minutes)

Select **PayFast outage** and place an order. The failed trace now includes the gateway call; it wasn't stuck acquiring a pool slot. Roll back. Ask: which evidence rules out the gateway in the earlier incident?

## Observability treasure hunt (5 minutes plus worksheet)

- Share the deployed storefront URL. Phones refresh it while you show verified Live Metrics in Azure.
- Request `/chai-not-found` to show real 404s in Application Insights. Use the worksheet's KQL.
- Use Dynatrace only after ingesting the required signals. The app's local dashboard cannot prove host CPU, a real database bottleneck, network service flow or a Dynatrace Problem. Use your instrumented environment for those questions.
- The console's SLI uses a rolling 60-second sample: checkout successful **and under 2 seconds**. Relate it to the 99.9% goal, then return to the paper game's 30-day error budget. Those are different observation windows.

## Follow the Order / ERP maintenance (3 minutes)

1. Select **Pause ERP**.
2. Place an order from the storefront. Checkout succeeds; CRM/SCM/HCM/BI events complete while ERP queues.
3. Show the queued invoice event, then recover with **Healthy / Roll back**. Queued ERP events become completed.
4. Explain this is simulated event replay, not a connection to Salesforce, SAP or an external durable broker.

## Reset and close

Stop traffic, restore healthy mode, wait for pending work to drain, export evidence and disconnect. Restarting resets telemetry/scenarios but leaves persisted orders/events at `DATA_DIR`. Rehearsal orders aren't customer data, but keep the generated `data/` directory out of Git.

After the workshop, inspect and delete only the dedicated cloud resources. Verify plans, monitoring and minimum instances are removed too. Budget alerts don't shut services down.
