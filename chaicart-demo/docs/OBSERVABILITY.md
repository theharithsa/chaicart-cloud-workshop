# ChaiCart observability

The complete runbook for all three sites is maintained in [observability.md](../../observability.md). It covers RUM, browser identity, OpenTelemetry traces/logs/metrics, deployment, correlation, demonstrations and troubleshooting.

## Workshop staff action backend (6 October 2026)

`workshopAction` is a Node.js 22 callable in `asia-south1`, alongside the telemetry gateway. It performs region-scoped captain/facilitator awards, individual Cloud or Not grading and corrections, and facilitator-only recursive session deletion. It verifies Google identity and reads staff access on the server; clients cannot write personal results or captain ledger entries directly.

The OTel service is `chaicart-live-workshop`. Browser operations are named `workshop.applyReview`, `workshop.manualAward`, `workshop.scoreCloud`, `workshop.undoCloud` and `workshop.deleteSession`. The gateway accepts only these additional bounded names. The callable validates a client trace ID, parent span ID and transaction ID, then creates a server span on that trace. Identity always comes from the verified token, never the correlation payload. Logs include verified email, UID, session, transaction and matching trace/span context; no answer bodies or credentials are logged. New callable ledger entries also retain the transaction ID. Operation outcomes and durations use bounded action/outcome dimensions.

The callable uses the existing Secret Manager token and OTLP base endpoint described above. It flushes exporters before returning. RUM action linkage still depends on tenant correlation settings; an explicitly connected browser/server OTel trace alone does not prove a RUM action link. Local emulator calls skip external server export. Limits: two instances, 256 MiB memory, 540-second maximum to support recursive deletion. Students cannot invoke successful staff mutations, and captains cannot delete sessions or reveal/reset global questions.

## Logging and trace review — 6 October 2026

HTTP requests emit one completion record, with a structured stdout JSON representation and native OTLP log attributes. These are two delivery channels for the same record, not two application events; avoid ingesting both stdout and OTLP into the same log pipeline without deduplication. Each completion carries request.id, transaction.id, route, method, response status, duration_ms and the active trace_id/span_id. Verified identities are attached after authentication; anonymous requests have no invented user identity.

Demo authentication emits auth.identity.verified or auth.identity.rejected, with a verification child span and bounded failure status. These describe server verification, not Google popup attempts or Firebase token issuance. Firebase issues its tokens; the Demo does not. Local preview session creation is labelled auth.session.created with auth.method=local-demo. Tokens, headers, credentials and submitted work are never logged.

Routes classify the landing page as /, assets as /static/*, unsupported APIs as /api/unmatched, and telemetry ingestion as /api/telemetry. Auth configuration is an in-memory response; no artificial database/cache spans are added. The Firebase gateway adds telemetry.export.browser_batch and telemetry.batch.processed, and links each imported browser span to its batch. Individual imported spans retain their original trace IDs and verified identity. A batch can contain multiple independent transactions and must not force them into one trace.

W3C traceparent is continued by the Demo server; Dynatrace RUM owns automatic frontend fetch instrumentation. Workshop callable actions explicitly carry validated parent context and transaction IDs. The Azure Demo and Firebase Live are separate applications: unrelated activity in their tabs is not a single distributed transaction. User/session/order IDs belong on logs and spans, not metric dimensions. The auth/config endpoint itself is public and has no authenticated identity to attach.

Regression verification decodes actual OTLP protobuf, checks one HTTP completion per request, trace/log IDs, simultaneous user isolation, authentication outcomes, and route classification.

## Instrumentation review, round 2

- `chaicart.auth.verifications` counts server identity checks by outcome, role and configured auth method. It is not a Google login counter. Firebase owns Google session creation, expiration and sign-out; the server has no reliable global active-session count.
- `chaicart.checkout.stage.duration` measures seconds independently for cart, payment, pool, payment insert/update, gateway, fulfillment and persistence. Outcome is success/failure. These stages overlap hierarchically; do not sum parent and child durations.
- `chaicart.cart.total_value` records validated checkout-attempt totals in INR, with small/large item-count buckets and currency-appropriate boundaries. It includes failed payment attempts and is not revenue. User/order/session IDs are excluded from metric dimensions.
- Checkout allocates the attempted order ID before payment; payment spans include user identity, order ID, item count, value, currency and simulated payment method. A failed attempt has no persisted order. Identity verification happens before order allocation and therefore has no invented order ID.
- Fulfillment has five `business.event.*` child spans, explicitly simulated, plus `orders.persist` for the real serialized local-file save. ERP queued events remain queued; simulation is not represented as a real external CRM/ERP call.
- Live browser Firestore spans include operation names and team IDs for recognized team document paths. The gateway continues to replace client identity with verified token identity. No document bodies, credentials or raw document paths are exported.
- Regression tests decode exported span status and verify ERROR for a simulated gateway outage and its payment parent, including order/user context. The sample code's shared stage stopwatch would accumulate prior stages; these stage timers instead start independently.

Backend W3C continuation and the existing RUM fetch instrumentation remain in place. No second automatic fetch patcher is installed alongside Dynatrace RUM. Public auth/config reads memory, so fabricated cache/database spans and a global session count are deliberately omitted. Tenant-observed latency claims in the supplied suggestions have not been independently verified by these code-level tests.

## RUM business actions

The compatibility adapter uses the current `dynatrace.userActions.create()` API when available, reuses/renames an active automatic action, and falls back to Classic `dtrum.enterAction/leaveAction`. The supplied guide's `createUserAction`, `onUserActionUpdate`, nested `properties` payload, and claim that Classic APIs were universally removed are not used. Official references: https://docs.dynatrace.com/docs/observe/digital-experience/rum/web-frontends/new-javascript-api and https://docs.dynatrace.com/javascriptapi/doc/types/dtrum.html .

User identification prefers `dynatrace.identifyUser(email)` with a Classic fallback. Anonymous users retain a random `browser:` ID, never an authorization credential or hardware identifier. Agent calls are guarded so missing, disabled or broken RUM cannot interrupt workshop work.

Demo actions: User Login/Logout, Load Auth Config, Load Menu, Add Item to Cart, Submit Checkout, Verify Facilitator Access and Change Demo Scenario. Checkout properties include the shared transaction ID, item count, currency and successful order ID; a semantic checkout_success event carries the validated response total. Background tracking and dashboard polls do not create custom user actions. No server payment stages are invented as frontend timings. Demo is not a route-based SPA.

Live actions: User Login/Logout, Save/Update/Submit Workshop Work, Save Workshop Transaction, Award Reviewed Credits, Adjust Team Credits, Score/Undo Cloud Answers and Delete Workshop Session. Inner Firestore writes do not interrupt an already tracked workflow. Hash routes emit page_view events with fixed page labels; query strings and student answers are omitted. Pages names selected workshop/demo links. The Pages build includes the adapter module.

Current API events use flat `event_properties.*` fields from an allowlist. No per-checkout event modifier is installed. Current user-action API availability depends on the enabled agent modules; Classic fallback supports custom action names and identity, while the new custom event payload is emitted only by the current API. Event/session property visibility may require corresponding Dynatrace configuration; that configuration was not changed. No new session properties or fictional user tier are introduced.

Tests cover current/Classic/missing/throwing agents, completion after failure, nested-action suppression and automatic-action reuse. Local browser verification exercised login, cart, checkout transaction/order properties, and logout back to anonymous identity with a controlled API stub. This verifies calls, not Dynatrace beacon receipt or tenant event visibility.
