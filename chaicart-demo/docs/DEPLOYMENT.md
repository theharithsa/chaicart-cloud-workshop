# Deployment: Azure or Firebase?

## Recommendation for this workshop

Use **Azure App Service, Linux, Node 24, one Basic B1 instance** as the initial workshop target. This matches the existing Azure exercises: Application Insights Live Metrics, failed-request queries, resource groups, cost budgets and GitHub Actions deployment. B1 is a starting point, not a verified capacity guarantee. Rehearse the crowd refresh and checkout surge at your actual tier.

Azure is not a technical requirement. Firebase with a Cloud Run backend can host this Node app, but it changes the Azure exercises and needs deliberate handling of state, concurrency and telemetry. Neither platform turns this single-process teaching app into production microservices.

| Option | Current app fit | What changes |
| --- | --- | --- |
| GitHub Pages / Firebase Hosting without a backend | Materials only | Static hosting cannot execute `server.js` |
| Azure App Service, single instance | Recommended workshop setup | Configure persistent `/home` storage, admin secret, Application Insights and CI/CD |
| Firebase Hosting + Cloud Run | Viable alternative | Container backend, Hosting rewrite, billing, storage decision and concurrency rehearsal |
| Firebase App Hosting | Possible Node path | Rehearse framework/build setup; not a drop-in static upload |

## Azure: first deployment

1. Create a dedicated resource group in Central India, then a Linux App Service on Node 24 LTS with one B1 instance. Keep all workshop-only resources in this group for cleanup.
2. App Service → Environment variables: configure [Firebase admin sign-in](AUTHENTICATION.md), `DATA_DIR=/home/chaicart-data`, and `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. Configure startup command `npm start`. Enable HTTPS Only, Always On, and the `/health` health check. The app's `.deployment` file also enables build automation for source ZIP uploads; Firebase dependencies must be installed before startup.
3. In GitHub repository Settings → Secrets and variables → Actions → Variables, add `AZURE_WEBAPP_NAME` with the actual App Service name. This enables deployment on `main`; without it the deploy job is skipped and tests still run.
4. Create GitHub environment `workshop`. Add environment secret `AZURE_WEBAPP_PUBLISH_PROFILE` using the profile downloaded from the chosen App Service. That profile is a deployment credential. Keep it out of commits. Publish profiles require the App Service's SCM basic authentication setting; organizations that require OIDC should replace the profile deployment with their approved Azure Login/OIDC setup.
5. In GitHub Actions select **ChaiCart demo — test and deploy → Run workflow** on `main`. The workflow installs/tests in `chaicart-demo/` and deploys that folder after tests pass. It does not deploy the workshop's root HTML as the backend. Normal app changes on `main` also trigger it.
6. Check `/health`, `/api/menu`, storefront checkout and the authenticated facilitator console at the Azure HTTPS URL.
7. Enable Application Insights for this Node app through the portal following [Microsoft's monitoring guide](https://learn.microsoft.com/en-us/azure/app-service/monitor-app-service). Restart and verify Live Metrics using traffic at the deployed URL. If the Node agent is unavailable for your combination of runtime/region, use Microsoft's supported SDK setup; don't assume enabling a connection string alone proves ingestion.
8. Set a budget notification at 80% in Cost Management. Budget notifications do not cap spending. Generate a QR code for the app URL and test on a phone.
9. Rehearse load, fault, rollback and ERP replay before class. Export evidence and capture cloud screenshots for the Wi-Fi fallback. Delete the dedicated resources after the workshop.

Persistent file storage still requires **one application instance**. Multiple instances would hold different pools, scenario settings and telemetry, and can overwrite the same JSON state. Do not enable autoscaling for this implementation. A restart resets fault mode and in-memory telemetry; order/event data can survive if the persistent path is correctly mounted.

## Workshop Azure environment

Provisioned on 3 October 2026 in subscription **D1/APAC**:

| Resource | Value |
| --- | --- |
| Resource group | `rg-chaicart-workshop` |
| Region | Central India |
| App Service plan | `plan-chaicart-workshop`, Linux B1, one instance |
| App Service | `chaicart-workshop-vh-20261003`, Node 24 LTS |
| Storefront | https://chaicart-workshop-vh-20261003.azurewebsites.net/ |
| Facilitator | https://chaicart-workshop-vh-20261003.azurewebsites.net/facilitator |
| Persistent state | `/home/chaicart-data/state.json` |

Firebase's authorized domains include this hostname. The backend service-account credential is in the encrypted App Service setting `FIREBASE_SERVICE_ACCOUNT_JSON`, with explicit approval, because the deployment account cannot assign Key Vault roles or write vault secrets. No private credential is included in source or the deployment ZIP. A subscription administrator can migrate this setting to a Key Vault reference using the [authentication guide](AUTHENTICATION.md). The unused empty vault from the initial attempt was deleted.

The initial deployment uses Azure CLI; GitHub deployment still requires the variable and environment secret described above. Without these, GitHub Actions tests run but the deploy job is skipped. Do not assume a Git push updates this environment.

For a manual deployment from the repository root, create a ZIP of the contents of `chaicart-demo/` containing the source, `package.json`, `package-lock.json`, and `.deployment`, excluding `.env`, credentials, `data/`, `node_modules`, and `.firebase-install-partial`. Then:

```bash
git archive --format=zip --output=/tmp/chaicart-azure-deploy.zip HEAD:chaicart-demo
az account set --subscription 09140929-1ca1-4623-90ec-a890c043f83a
az webapp deploy --resource-group rg-chaicart-workshop \
  --name chaicart-workshop-vh-20261003 --src-path /tmp/chaicart-azure-deploy.zip --type zip
```

The archive command deploys committed code only. Commit intended changes first; ignored secrets and local files are excluded.

Check `/health` after deployment and rehearse Google sign-in, ordering, and facilitator controls. App Service build success does not by itself prove the app started successfully. Inspect startup logs if dependencies are missing.

This B1 plan is billable while it exists; stopping only the web app does not stop plan charges. After the workshop, export evidence and delete the dedicated resource group if it is no longer needed. Dynatrace RUM and application OTel now have an explicit implementation and [observability runbook](OBSERVABILITY.md). Configure the server-only ingest token/endpoint and verify each signal; Application Insights and host monitoring remain separate.

## Firebase / Cloud Run considerations

[Firebase Hosting can forward dynamic requests to Cloud Run](https://firebase.google.com/docs/hosting/cloud-run). For this app, a straightforward Google Cloud route is the supplied Dockerfile on Cloud Run, with Firebase Hosting optionally providing the public domain and rewrites. Firebase App Hosting also runs apps on Cloud Run; its [framework/tooling guidance](https://firebase.google.com/docs/app-hosting/frameworks-tooling) should be checked for a plain Node project.

Before choosing this path:

- Enable the required billing plan and Cloud Run APIs; this is not a promise of a free workshop. Follow Firebase's linked setup guide for current prerequisites.
- Route the storefront, static assets and `/api/**` to the same backend. Hosting only `public/` without API rewrites produces a storefront with broken menu/checkout calls.
- Use Secret Manager / workload identity for backend Firebase credentials. Keep it out of Firebase config, browser JavaScript and source control.
- Keep one minimum and one maximum instance for a deterministic rehearsal; retain one serving revision. Multiple instances/revisions can split fault state and orders. Minimum instances incur cost, and a minimum setting does not guarantee an instance will never restart.
- Cloud Run's local filesystem is **ephemeral and uses instance memory**. The current `data/state.json` does not survive instance replacement. Either accept disposable session state explicitly for a rehearsal or implement persistent external storage before relying on order history. Firebase Auth/Firestore are used for facilitator authorization; orders/events are not stored in Firestore. See the [Cloud Run runtime contract](https://docs.cloud.google.com/run/docs/container-contract).
- Rehearse container concurrency. A low platform concurrency limit can make the platform queue or reject traffic before the app's pool becomes saturated. [Cloud Run supports up to 1,000 concurrent requests per instance](https://docs.cloud.google.com/run/docs/about-concurrency); that ceiling is not a safe sizing recommendation. The 60/sec × 45s incident test can produce hundreds of waiting requests. Adjust rate/duration/concurrency and inspect where delays occur so students see application pool timeouts rather than a hosting admission limit.
- Firebase Hosting imposes a [60-second request timeout](https://firebase.google.com/docs/hosting/serverless-overview), even when the backend timeout is longer. The app's default 30-second pool acquisition timeout fits within it, but storage queueing and startup also consume time.
- Firebase hosting does not automatically supply Azure Application Insights or Dynatrace telemetry. Adapt the Azure worksheet to Google Cloud tools or keep a separate Azure environment for that section. Dynatrace ingestion still needs deliberate setup and verification.

For a production Firebase version, migrate orders/events to durable storage, add idempotent checkout and durable event processing, and move scenario control to shared state if replicas are allowed. This repository has not implemented those migrations or a verified Firebase deployment.

## CI/CD classroom exercise

Make a visible title change in `chaicart-demo/public/index.html`, commit to the workshop repository and show the test/deploy jobs. Refresh the actual Azure app URL after a green deployment.

For a blocked deployment rehearsal, create a temporary test in `chaicart-demo/test/` that fails (`assert.equal(1, 2)`). Use a branch/PR first. Its tests fail and a PR never deploys. To show that a failed `main` build blocks Azure, use a controlled workshop commit to `main`; immediately revert the failing-test commit after demonstrating that the deploy job is skipped. Do not weaken the real application tests just to get a green pipeline.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App isn't on GitHub Pages | Expected: Pages publishes workshop materials; open the backend URL |
| Menu/checkout fails on Firebase | Backend routing exists for `/api/**` and the backend is running |
| Azure starts the wrong app | Deployment package is `chaicart-demo`, startup is `npm start` |
| Azure deploy job is skipped | `AZURE_WEBAPP_NAME` is set at repository level, run is on `main`, tests pass |
| Facilitator access denied | Verify Firebase project, backend credentials, verified Google email and matching admin document; see the authentication guide |
| Orders disappear after restart | `DATA_DIR` points to persistent storage; Cloud Run defaults are ephemeral |
| Failure doesn't appear | App is in pool-exhaustion mode; enough simultaneous requests actually arrive |
| Different students see different states | Multiple instances or revisions are serving requests |
| Local traces but no cloud traces | Collector endpoint, receiver format, exporter credentials and tenant ingestion settings |
| No Dynatrace Problem / host metrics | Those require additional monitoring and alert configuration; local spans alone are insufficient |

## Verification status

Azure deployment on 3 October 2026 was verified with `/health`, `/api/menu`, public Firebase configuration, storefront and facilitator browser rendering, 401 responses for signed-out protected APIs, and 404 for the disabled local demo-login endpoint. All 12 backend tests passed locally, including credential project validation and sanitized failure handling. Google sign-in, authenticated ordering/facilitator controls, and restart persistence still require a live rehearsal on the Azure hostname. Firebase/Cloud Run deployment, Docker execution, crowd capacity and external telemetry ingestion remain unverified.
