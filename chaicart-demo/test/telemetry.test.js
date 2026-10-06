import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createApp } from '../server.js';

// Decode the OTLP envelope independently of the exporter, including correlation
// IDs and temporality. Field numbers come from the public OTLP proto schema.
const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
const schema = protobuf.parse(`syntax="proto3";
message Value { string stringValue=1; bool boolValue=2; int64 intValue=3; double doubleValue=4; }
message Attr { string key=1; Value value=2; }
message Resource { repeated Attr attributes=1; }
message Scope { string name=1; }
message Status { int32 code=3; }
message Span { bytes traceId=1; bytes spanId=2; bytes parentSpanId=4; string name=5; repeated Attr attributes=9; Status status=15; }
message ScopeSpans { Scope scope=1; repeated Span spans=2; }
message ResourceSpans { Resource resource=1; repeated ScopeSpans scopeSpans=2; }
message Traces { repeated ResourceSpans resourceSpans=1; }
message Log { Value body=5; repeated Attr attributes=6; bytes traceId=9; bytes spanId=10; }
message ScopeLogs { repeated Log logRecords=2; }
message ResourceLogs { repeated ScopeLogs scopeLogs=2; }
message Logs { repeated ResourceLogs resourceLogs=1; }
message Sum { int32 aggregationTemporality=2; }
message Histogram { int32 aggregationTemporality=2; }
message Metric { string name=1; Sum sum=7; Histogram histogram=9; }
message ScopeMetrics { repeated Metric metrics=2; }
message ResourceMetrics { repeated ScopeMetrics scopeMetrics=2; }
message Metrics { repeated ResourceMetrics resourceMetrics=1; }
`).root;
const attributes = span => Object.fromEntries(span.attributes.map(a => [a.key, a.value.stringValue || a.value.intValue?.toString() || a.value.boolValue]));

test('OTLP protobuf exports all signals, preserves RUM context and isolates concurrent identities', async () => {
  const received = [];
  const collector = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    let data = Buffer.concat(chunks); if (req.headers['content-encoding'] === 'gzip') data = gunzipSync(data);
    received.push({ path: req.url, headers: req.headers, data }); res.writeHead(200, { 'content-type': 'application/x-protobuf' }); res.end();
  });
  await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collector.address().port}`;
  process.env.DYNATRACE_PLATFORM_TOKEN = 'dt0c01.test-only-token';
  const dir = await mkdtemp(tmpdir() + '/chaicart-otel-test-');
  const app = await createApp({ dataDir: dir, authMode: 'local-token', adminToken: 'local', gatewayDelay: 1,
    customerAuthorizer: async req => ({ uid: req.headers.authorization, email: req.headers.authorization + '@example.test' }) });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const traces = ['1234567890abcdef1234567890abcdef', 'abcdef1234567890abcdef1234567890'];
  try {
    const responses = await Promise.all(['alice', 'bob'].map((actor, index) => fetch(url + '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: actor, traceparent: `00-${traces[index]}-1234567890abcdef-01` }, body: JSON.stringify({ city: 'Mumbai', items: [{ id: 'coffee', quantity: 1 }] }) })));
    for (const [i, response] of responses.entries()) { assert.equal(response.status, 201); assert.equal(response.headers.get('x-trace-id'), traces[i]); await response.json(); }
    await fetch(url + '/api/auth/config');
    await fetch(url + '/missing.css');
    await fetch(url + '/api/unknown');
    await app.telemetry.flush();
    for (const path of ['/v1/traces', '/v1/logs', '/v1/metrics']) assert.ok(received.some(r => r.path === path), path);
    for (const entry of received) { assert.equal(entry.headers.authorization, 'Api-Token dt0c01.test-only-token'); assert.equal(entry.headers['content-type'], 'application/x-protobuf'); }
    const spans = received.filter(r => r.path === '/v1/traces').flatMap(r => schema.lookupType('Traces').decode(r.data).resourceSpans.flatMap(rs => rs.scopeSpans.flatMap(ss => ss.spans)));
    for (const [i, actor] of ['alice', 'bob'].entries()) {
      const actorSpans = spans.filter(s => s.traceId.toString('hex') === traces[i]);
      assert.ok(actorSpans.length >= 8);
      const payment = actorSpans.find(s => s.name === 'Process demo payment');
      assert.equal(attributes(payment)['user.email'], actor + '@example.test');
      assert.ok(actorSpans.every(s => !attributes(s)['user.email'] || attributes(s)['user.email'] === actor + '@example.test'));
      assert.ok(actorSpans.every(s => attributes(s)['transaction.id']));
      assert.ok(attributes(payment)['order.id']);
      assert.equal(attributes(payment)['cart.currency'], 'INR');
      assert.ok(actorSpans.some(s => s.name === 'orders.persist'));
      assert.equal(actorSpans.filter(s => s.name.startsWith('business.event.')).length, 5);
    }
    const records = received.filter(r => r.path === '/v1/logs').flatMap(r => schema.lookupType('Logs').decode(r.data).resourceLogs.flatMap(rs => rs.scopeLogs.flatMap(ss => ss.logRecords)));
    const completed = records.filter(r => attributes(r)['event.name'] === 'http.request.completed');
    assert.equal(completed.length, 5, 'exactly one completion per request');
    assert.ok(completed.every(r => r.traceId.length === 16 && r.spanId.length === 8 && attributes(r)['request.id'] && attributes(r)['transaction.id']));
    assert.ok(spans.some(s => attributes(s)['http.route'] === '/static/*'));
    assert.ok(spans.some(s => attributes(s)['http.route'] === '/api/unmatched'));
    assert.ok(spans.every(s => !s.name.includes('static-or-unknown')));
    assert.equal(records.filter(r => attributes(r)['event.name'] === 'auth.identity.verified').length, 2);
    const placed = records.filter(r => r.body.stringValue === 'Order placed'); assert.equal(placed.length, 2);
    for (const record of placed) { assert.equal(record.traceId.length, 16); assert.equal(record.spanId.length, 8); assert.ok(attributes(record)['user.email']); assert.ok(attributes(record)['order.id']); }
    const metricData = received.filter(r => r.path === '/v1/metrics').flatMap(r => schema.lookupType('Metrics').decode(r.data).resourceMetrics.flatMap(rs => rs.scopeMetrics.flatMap(ss => ss.metrics)));
    for (const name of ['chaicart.auth.verifications','chaicart.checkout.stage.duration','chaicart.cart.total_value']) assert.ok(metricData.some(m => m.name === name), name);
    assert.equal(metricData.find(m => m.name === 'chaicart.http.requests').sum.aggregationTemporality, 1);
    assert.equal(metricData.find(m => m.name === 'http.server.request.duration').histogram.aggregationTemporality, 1);
    received.length = 0;
    const scenario = await fetch(url + '/api/admin/scenario', { method:'POST', headers:{authorization:'Bearer local','content-type':'application/json'}, body:JSON.stringify({scenario:'gateway-down'}) });
    assert.equal(scenario.status, 200);
    const failed = await fetch(url + '/api/checkout', { method:'POST', headers:{authorization:'alice','content-type':'application/json'}, body:JSON.stringify({city:'Mumbai',items:[{id:'coffee',quantity:1}]}) });
    assert.equal(failed.status, 504);
    await app.telemetry.flush();
    const failedSpans = received.filter(r => r.path === '/v1/traces').flatMap(r => schema.lookupType('Traces').decode(r.data).resourceSpans.flatMap(rs => rs.scopeSpans.flatMap(ss => ss.spans)));
    const gateway = failedSpans.find(s => s.name === 'Demo gateway charge');
    assert.equal(gateway.status.code, 2);
    assert.ok(attributes(gateway)['order.id']);
    assert.equal(attributes(gateway)['user.email'], 'alice@example.test');
    assert.equal(failedSpans.find(s => s.name === 'Process demo payment').status.code, 2);

  } catch (error) { console.error(error.stack); throw error; } finally {
    await app.close(); await new Promise(resolve => collector.close(resolve)); await rm(dir, { recursive: true, force: true });
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT; delete process.env.DYNATRACE_PLATFORM_TOKEN;
  }
});
