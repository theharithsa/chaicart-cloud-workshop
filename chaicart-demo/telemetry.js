import { diag, context, trace, propagation, SpanKind, SpanStatusCode, metrics } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { PeriodicExportingMetricReader, AggregationTemporality, AggregationType, InstrumentType } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export function createTelemetry(serviceName = 'chaicart-demo', options = {}) {
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const token = options.token ?? process.env.DYNATRACE_PLATFORM_TOKEN;
  const resource = resourceFromAttributes({ 'service.name': serviceName, 'service.namespace': 'chaicart', 'service.version': process.env.SERVICE_VERSION || '1.1.0', 'deployment.environment.name': process.env.DEPLOYMENT_ENVIRONMENT || 'workshop', 'service.instance.id': process.env.WEBSITE_INSTANCE_ID || process.env.K_REVISION || randomUUID() });
  let sdk, exporter, spanProcessor, logProcessor, metricReader;
  const exportHealth = { failures: 0, partial: 0, dropped: 0 };
  // Failure diagnostics contain no headers, payloads or exporter error objects.
  function watch(instance) {
    const original = instance.export.bind(instance);
    instance.export = (data, done) => original(data, result => {
      if (result.code !== 0) { exportHealth.failures++; console.warn(JSON.stringify({ event: 'telemetry.export.failed', 'service.name': serviceName, signal: instance.constructor.name, status: Number(result.error?.code) || undefined })); }
      done(result);
    });
    return instance;
  }
  if (endpoint) {
    diag.setLogger({ debug() {}, info() {}, verbose() {}, error() { exportHealth.failures++; }, warn(...messages) { if (messages.some(m => typeof m === 'string' && /partial success/i.test(m))) exportHealth.partial++; if (messages.some(m => typeof m === 'string' && /dropp(ed|ing)/i.test(m))) exportHealth.dropped++; } });
    const config = signal => ({ url: endpoint.replace(/\/$/, '') + '/v1/' + signal, headers: token ? { Authorization: 'Bearer ' + token } : {}, timeoutMillis: 5000, concurrencyLimit: 2, compression: 'gzip' });
    exporter = watch(new OTLPTraceExporter(config('traces')));
    spanProcessor = new BatchSpanProcessor({ exporter, maxQueueSize: 1024, maxExportBatchSize: 128, scheduledDelayMillis: 2000, exportTimeoutMillis: 6000 });
    metricReader = new PeriodicExportingMetricReader({ exporter: watch(new OTLPMetricExporter({ ...config('metrics'), temporalityPreference: AggregationTemporality.DELTA })), exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 15000), exportTimeoutMillis: 6000 });
    logProcessor = new BatchLogRecordProcessor({ exporter: watch(new OTLPLogExporter(config('logs'))), maxQueueSize: 1024, maxExportBatchSize: 128, scheduledDelayMillis: 2000, exportTimeoutMillis: 6000 });
    sdk = new NodeSDK({ resource, spanProcessors: [spanProcessor], metricReaders: [metricReader], logRecordProcessors: [logProcessor],
      views: [{ instrumentType: InstrumentType.HISTOGRAM, aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60] } }, aggregationCardinalityLimit: 500 }],
      // This demo records every application span; no HTTP instrumentation of exporter traffic.
      sampler: { shouldSample: () => ({ decision: 2 }), toString: () => 'ChaiCartWorkshopAlwaysOn' },
    });
    sdk.start();
  }
  const tracer = trace.getTracer('chaicart.application');
  const logger = logs.getLogger('chaicart.application');
  const meter = metrics.getMeter('chaicart.application');
  const requests = meter.createCounter('chaicart.http.requests', { unit: '{request}' });
  const duration = meter.createHistogram('http.server.request.duration', { unit: 's' });
  const checkout = meter.createCounter('chaicart.checkout.outcomes', { unit: '{checkout}' });
  const operationCount = meter.createCounter('chaicart.operation.outcomes', { unit: '{operation}' });
  const operationDuration = meter.createHistogram('chaicart.operation.duration', { unit: 's' });
  const active = meter.createUpDownCounter('http.server.active_requests', { unit: '{request}' });
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  const gauges = (name, unit, get) => meter.createObservableGauge(name, { unit }).addCallback(result => result.observe(get()));
  gauges('process.memory.usage', 'By', () => process.memoryUsage().rss);
  gauges('nodejs.memory.heap.used', 'By', () => process.memoryUsage().heapUsed);
  gauges('process.uptime', 's', () => process.uptime());
  gauges('nodejs.eventloop.delay', 's', () => Number.isFinite(loop.mean) ? loop.mean / 1e9 : 0);
  let cpu = process.cpuUsage(), cpuAt = performance.now();
  gauges('process.cpu.utilization', '1', () => { const now = performance.now(), next = process.cpuUsage(); const value = (next.user + next.system - cpu.user - cpu.system) / Math.max(1, (now - cpuAt) * 1000); cpu = next; cpuAt = now; return value; });
  gauges('chaicart.telemetry.export.failures', '{failure}', () => exportHealth.failures);
  gauges('chaicart.telemetry.export.partial_success', '{response}', () => exportHealth.partial);
  gauges('chaicart.telemetry.dropped_batches', '{batch}', () => exportHealth.dropped);
  function attributes(extra = {}) {
    const span = trace.getSpan(context.active());
    return { ...(span?.chaicartAttributes || {}), ...extra };
  }
  function log(level, message, extra = {}, ctx = context.active()) {
    const sc = trace.getSpanContext(ctx);
    const a = attributes(extra);
    logger.emit({ context: ctx, severityText: level, severityNumber: SeverityNumber[level] || SeverityNumber.INFO, body: message, attributes: a });
    return { ...a, ...(sc && trace.isSpanContextValid(sc) ? { trace_id: sc.traceId, span_id: sc.spanId } : {}) };
  }
  function enrich(extra) {
    const span = trace.getSpan(context.active());
    if (span) { span.chaicartAttributes = { ...(span.chaicartAttributes || {}), ...extra }; span.setAttributes(extra); }
  }
  async function span(name, extra, work) {
    const inherited = attributes(extra);
    return tracer.startActiveSpan(name, { attributes: inherited }, async current => {
      current.chaicartAttributes = inherited;
      try { return await work(current); }
      catch (error) { current.setStatus({ code: SpanStatusCode.ERROR, message: error.status ? 'Request rejected' : 'Operation failed' }); current.addEvent('exception', { 'exception.type': String(error.code || error.name || 'Error').slice(0, 100) }); throw error; }
      finally { current.end(); }
    });
  }
  async function request(req, res, work) {
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = path.startsWith('/api/orders/') ? '/api/orders/:orderId' : ['/api/menu', '/api/checkout', '/api/orders', '/api/auth/me', '/api/auth/config', '/api/auth/demo', '/api/admin/session', '/api/admin/scenario', '/api/admin/telemetry', '/health'].includes(path) ? path : 'static-or-unknown';
    const requestId = randomUUID();
    const transactionId = /^[0-9a-f-]{36}$/i.test(req.headers['x-transaction-id'] || '') ? req.headers['x-transaction-id'] : randomUUID();
    const parent = propagation.extract(context.active(), req.headers);
    return context.with(parent, () => tracer.startActiveSpan(req.method + ' ' + route, { kind: SpanKind.SERVER, attributes: { 'http.request.method': req.method, 'http.route': route, 'request.id': requestId, 'transaction.id': transactionId } }, async current => {
      current.chaicartAttributes = { 'request.id': requestId, 'transaction.id': transactionId, 'http.route': route };
      res.setHeader('x-request-id', requestId); res.setHeader('x-transaction-id', transactionId);
      const start = performance.now(); active.add(1);
      let ended = false;
      const finish = () => {
        if (ended) return; ended = true;
        const elapsed = (performance.now() - start) / 1000;
        const status = res.writableFinished ? res.statusCode : 499;
        current.setAttribute('http.response.status_code', status);
        if (status >= 500 || status === 499) current.setStatus({ code: SpanStatusCode.ERROR });
        const dimensions = { 'http.route': route, 'http.request.method': req.method, 'http.response.status_code': status };
        requests.add(1, dimensions); duration.record(elapsed, dimensions); active.add(-1);
        if (route === '/api/checkout') checkout.add(1, { outcome: status === 201 ? 'success' : 'failure', 'sli.good': status === 201 && elapsed < 2 });
        // Keep high-frequency dashboard polls out of INFO logs.
        if (route !== '/api/admin/telemetry' || status >= 400) log(status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO', 'HTTP request completed', { ...current.chaicartAttributes, 'event.name': 'http.request.completed', ...dimensions, duration_ms: elapsed * 1000 }, trace.setSpan(context.active(), current));
        current.end();
      };
      res.once('finish', finish); res.once('close', finish);
      try { return await work(current); } catch (error) { current.setStatus({ code: SpanStatusCode.ERROR }); if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"Request failed"}'); } else res.end(); }
    }));
  }
  function recordOperation(name, outcome, seconds, extra = {}) { const a = { operation: name, outcome, ...extra }; operationCount.add(1, a); operationDuration.record(seconds, a); }
  return { request, span, log, enrich, gauges, recordOperation, tracer, meter, resource, exporter, exportHealth,
    current: () => trace.getSpan(context.active()),
    flush: async () => { const results = await Promise.allSettled([spanProcessor?.forceFlush(), logProcessor?.forceFlush(), metricReader?.forceFlush()]); return results.every(result => result.status === 'fulfilled'); },
    shutdown: async () => { loop.disable(); await sdk?.shutdown().catch(() => { console.warn(JSON.stringify({event:'telemetry.shutdown.failed','service.name':serviceName})); }); },
  };
}
