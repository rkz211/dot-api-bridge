import {test} from 'node:test';
import assert from 'node:assert/strict';
import {genericCall} from './generic.mjs';
import {extraCall, digest} from './writes.mjs';
import {SERVICES} from './services.mjs';

const env = {COOKIEJAR_ENABLED: 'true', HUB_KEY: 'FAKE_TIMEOUT_TEST_KEY', WRITES_ENABLED: 'true'};
const operationId = '12345678-1234-1234-1234-123456789abc';

function ledger() {
  const rows = new Map();
  return {
    async get(id) {return rows.get(id);},
    async claim(id, fingerprint) {
      if (rows.has(id)) return false;
      rows.set(id, {fingerprint, state: 'in_progress'});
      return true;
    },
    async set(id, state, result) {Object.assign(rows.get(id), {state, result: JSON.stringify(result)});}
  };
}

// No wall-clock waits or upstream calls: only the production deadline is advanced.
function stalledBody(t, expectedDelay) {
  const timers = new Map();
  const set = globalThis.setTimeout;
  const clear = globalThis.clearTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    if (delay !== 20000 && delay !== 30000) return set(callback, delay, ...args);
    const timer = {};
    timers.set(timer, {callback, delay});
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', timer => {
    if (!timers.delete(timer)) clear(timer);
  });
  let started, controller, signal;
  const reading = new Promise(resolve => {started = resolve;});
  t.after(() => controller?.error(new Error('Synthetic body cleanup')));
  return {
    async fetcher(_url, init) {
      signal = init.signal;
      return new Response(new ReadableStream({
        start(value) {
          controller = value;
          signal.addEventListener('abort', () => controller.error(new Error('Synthetic body timeout')), {once: true});
        },
        pull() {started();}
      }, {highWaterMark: 0}), {headers: {'content-type': 'application/json'}});
    },
    async expire() {
      await reading;
      // Let any incorrectly eager finally block clear its timer before checking.
      await Promise.resolve();
      assert.equal(timers.size, 1, 'deadline must remain active while the body is unread');
      const [{callback, delay}] = timers.values();
      assert.equal(delay, expectedDelay);
      callback();
      assert.equal(signal.aborted, true);
    },
    assertCleaned() {assert.equal(timers.size, 0, 'deadline must be cleared after parsing rejects');}
  };
}

test('generic read deadline covers the response body after headers arrive', async t => {
  const stalled = stalledBody(t, 20000);
  const pending = genericCall('bridge_api_read', {
    serviceId: 'cookiejar', method: 'GET', path: '/sites'
  }, env, stalled.fetcher);
  const rejected = assert.rejects(pending, /Synthetic body timeout/);
  await stalled.expire();
  await rejected;
  stalled.assertCleaned();
});

test('dedicated create body timeout records uncertainty and cannot repeat the mutation', async t => {
  const stalled = stalledBody(t, 20000);
  const store = ledger();
  const args = {operationId, name: 'Synthetic timeout site'};
  let mutations = 0;
  const fetcher = async (url, init) => {
    if (init.method === 'GET') return Response.json({sites: []});
    mutations++;
    return stalled.fetcher(url, init);
  };
  const pending = extraCall('cookiejar_create_site', args, env, fetcher, response => response.json(), store);
  await stalled.expire();
  const result = await pending;
  assert.equal(result.state, 'needs_reconciliation');
  assert.equal(result.result.phase, 'creating');
  stalled.assertCleaned();
  assert.equal((await extraCall('cookiejar_create_site', args, env, fetcher, response => response.json(), store)).replayed, true);
  assert.equal(mutations, 1);
});

test('generic upload body timeout records uncertainty and cannot repeat the PUT', async t => {
  const stalled = stalledBody(t, 30000);
  const store = ledger();
  const bytes = new TextEncoder().encode('synthetic source bytes');
  const args = {
    serviceId: 'cookiejar', siteId: 'example-site', deployId: 'example-deploy', operationId,
    uploadUrl: `https://${SERVICES.cookiejar.uploadHost}/example-site/deploys/example-deploy/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE`,
    bodyBase64: btoa('synthetic source bytes'), sha256: await digest(bytes)
  };
  let mutations = 0;
  const fetcher = (...args) => {mutations++; return stalled.fetcher(...args);};
  const pending = genericCall('bridge_api_upload', args, env, fetcher, store);
  await stalled.expire();
  assert.equal((await pending).state, 'needs_reconciliation');
  stalled.assertCleaned();
  assert.equal((await genericCall('bridge_api_upload', args, env, fetcher, store)).replayed, true);
  assert.equal(mutations, 1);
});
