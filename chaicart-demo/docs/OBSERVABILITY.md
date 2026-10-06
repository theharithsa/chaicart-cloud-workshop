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
