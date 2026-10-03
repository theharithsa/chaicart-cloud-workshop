# Facilitator runbook

Use with the original facilitator guide and slides in the repository root. This app supplements the paper games; it doesn't replace scoring, architecture posters or the murder-mystery envelopes.

## Deployed workshop environment

- [Storefront — chai, coffee and snacks](https://chaicart-workshop-vh-20261003.azurewebsites.net/)
- [Facilitator console](https://chaicart-workshop-vh-20261003.azurewebsites.net/facilitator)
- Azure subscription **D1/APAC**, Central India; resource group `rg-chaicart-workshop`.
- App `chaicart-workshop-vh-20261003`; plan `plan-chaicart-workshop`, Linux B1, one instance, Node 24 LTS. HTTPS, Always On and `/health` checks are enabled.
- Orders/events persist in `/home/chaicart-data/state.json`. Keep one instance; telemetry and fault settings reset on restart.
- Customer login: verified Google account. Facilitator login: verified Google account with a matching Firestore `admins/{email}` document. No facilitator shared token is used on Azure.
- Firebase backend credentials are in an encrypted App Service setting. Never project or export secret settings. See [authentication](AUTHENTICATION.md) and [deployment](DEPLOYMENT.md) notes.

## Before participants arrive

- Open the deployed storefront and facilitator console in separate tabs. Sign in with Google; restore **Healthy / Roll back** and stop any running surge.
- Confirm normal checkout, menu, tracking and `/chai-not-found` (404). Each customer must sign in to order. All prices/payments/deliveries are demonstration data.
- Test the storefront from a phone and prepare its QR code. Rehearse the surge at the Azure URL before inviting classroom traffic; B1 capacity has not been verified for the crowd.
- Health, public routes and signed-out access controls passed deployment checks. Google sign-in, authenticated ordering/controls and restart persistence need a live rehearsal.
- **Observability status:** the app console works locally within the Node process. Dynatrace OTel metrics/logs/traces and Application Insights ingestion are not configured or verified. Use a separately instrumented environment or saved evidence for cloud-only questions until ingestion is confirmed.
- **CI/CD status:** GitHub tests pass; automatic Azure deployment is not enabled. Configure and rehearse deployment credentials before the live commit-to-deploy exercise. Follow the existing workflow, not a second Portal-generated workflow.
- Save screenshots/recordings for unreliable Wi-Fi. The original slides and games work offline; this storefront requires the Azure backend.

For an offline rehearsal only, follow the README's explicit local-token setup. That fallback is separate from the deployed Google sign-in flow.

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
BASE_URL=https://chaicart-workshop-vh-20261003.azurewebsites.net RATE=60 SECONDS=45 npm run load
```

Firebase mode also requires `CUSTOMER_ID_TOKEN` for a signed-in, verified Google customer. Set it securely in the current shell; never paste it into slides, commands saved in Git, or shared evidence. The facilitator console surge uses its current Google session and is the simplest presenter path.

On PowerShell, set `$env:BASE_URL`, `$env:RATE`, `$env:SECONDS` and `$env:CUSTOMER_ID_TOKEN` first. The tool creates demo orders at the chosen destination; run it only against your workshop app. It waits for pending requests after the sending interval ends.

## Distinguish a gateway outage (2 minutes)

Select **PayFast outage** and place an order. The failed trace now includes the gateway call; it wasn't stuck acquiring a pool slot. Roll back. Ask: which evidence rules out the gateway in the earlier incident?

## Observability treasure hunt (5 minutes plus worksheet)

- Share the deployed storefront QR code. Phones load the menu and sign in to place orders; show request timings, logs and logical traces in the facilitator console.
- Request `/chai-not-found` for a real 404. Live Metrics and the worksheet's KQL require Application Insights ingestion, which is still pending; use prepared evidence or a separately verified environment until it is ready.
- Use Dynatrace only after ingesting the required signals. The app's local dashboard cannot prove host CPU, a real database bottleneck, network service flow or a Dynatrace Problem. Use your instrumented environment for those questions.
- The console's SLI uses a rolling 60-second sample: checkout successful **and under 2 seconds**. Relate it to the 99.9% goal, then return to the paper game's 30-day error budget. Those are different observation windows.

## Follow the Order / ERP maintenance (3 minutes)

1. Select **Pause ERP**.
2. Place an order from the storefront. Checkout succeeds; CRM/SCM/HCM/BI events complete while ERP queues.
3. Show the queued invoice event, then recover with **Healthy / Roll back**. Queued ERP events become completed.
4. Explain this is simulated event replay, not a connection to Salesforce, SAP or an external durable broker.

## Reset and close

Stop traffic, restore healthy mode, wait for pending work to drain, export evidence and disconnect. Restarting resets telemetry/scenarios but leaves persisted orders/events at `DATA_DIR`. Orders are linked to signed-in customer UIDs. Keep persisted state, credential files and exported evidence out of Git; review evidence before sharing.

Keep `rg-chaicart-workshop` running between workshop days; delete only `rg-chaicart-day1` after the container race. After the whole workshop, export evidence and inspect/delete `rg-chaicart-workshop` only when the app is no longer needed. Verify plans, monitoring and minimum instances are removed too. Budget alerts don't shut services down.
