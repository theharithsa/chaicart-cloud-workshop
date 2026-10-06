# ChaiCart observability

The complete runbook for all three sites is maintained in [observability.md](../../observability.md). It covers RUM, browser identity, OpenTelemetry traces/logs/metrics, deployment, correlation, demonstrations and troubleshooting.

## Workshop staff action backend (6 October 2026)

`workshopAction` is a Node.js 22 callable in `asia-south1`, alongside the telemetry gateway. It performs region-scoped captain/facilitator awards, individual Cloud or Not grading and corrections, and facilitator-only recursive session deletion. It verifies Google identity and reads staff access on the server; clients cannot write personal results or captain ledger entries directly.

The OTel service is `chaicart-live-workshop`. Browser operations are named `workshop.applyReview`, `workshop.manualAward`, `workshop.scoreCloud`, `workshop.undoCloud` and `workshop.deleteSession`. The gateway accepts only these additional bounded names. The callable validates a client trace ID, parent span ID and transaction ID, then creates a server span on that trace. Identity always comes from the verified token, never the correlation payload. Logs include verified email, UID, session, transaction and matching trace/span context; no answer bodies or credentials are logged. New callable ledger entries also retain the transaction ID. Operation outcomes and durations use bounded action/outcome dimensions.

The callable uses the existing Secret Manager token and OTLP base endpoint described above. It flushes exporters before returning. RUM action linkage still depends on tenant correlation settings; an explicitly connected browser/server OTel trace alone does not prove a RUM action link. Local emulator calls skip external server export. Limits: two instances, 256 MiB memory, 540-second maximum to support recursive deletion. Students cannot invoke successful staff mutations, and captains cannot delete sessions or reveal/reset global questions.
