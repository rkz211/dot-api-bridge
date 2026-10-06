import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXTRA_TOOLS, extraCall, digest, validateZip, validateUploadUrl, createLedger} from './writes.mjs';
import * as helpers from './helpers.mjs';
import {createHandler} from './worker.mjs';
import {SERVICES} from './services.mjs';

// All identities, credentials, and source bytes in this suite are synthetic.
// Provider hosts come from operator configuration; every request and all storage are mocked.
const base64 = readFileSync(new URL('./test-fixtures/source.b64', import.meta.url), 'utf8').trim();
const env = {
  COOKIEJAR_ENABLED: 'true', HUB_KEY: 'FAKE_TEST_CREDENTIAL',
  OWNER_USER_ID: 'test-owner', WRITES_ENABLED: 'true'
};
const operationId = '12345678-1234-1234-1234-123456789abc';
const siteId = 'example-site';
const deployId = 'example-deployment';
const uploadHost = SERVICES.cookiejar.uploadHost;
const origin = SERVICES.cookiejar.baseUrl;
const uploadUrl = `https://${uploadHost}/${siteId}/deploys/${deployId}/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE`;
const readJson = response => response.json();

function ledger() {
  const rows = new Map();
  return {
    rows,
    async get(id) {return rows.get(id);},
    async claim(id, fingerprint) {
      if (rows.has(id)) return false;
      rows.set(id, {fingerprint, state: 'in_progress'});
      return true;
    },
    async set(id, state, result) {
      Object.assign(rows.get(id), {state, result: JSON.stringify(result)});
    }
  };
}

const deployArgs = async () => ({
  operationId, siteId, kind: 'static', sourceZipBase64: base64,
  sourceSha256: await digest(validateZip(base64))
});

const rpc = (name, args = {}, user = env.OWNER_USER_ID) => new Request('https://bridge.example.invalid/mcp', {
  method: 'POST',
  headers: {'content-type': 'application/json', ...(user ? {'oai-authenticated-user-id': user} : {})},
  body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})
});

function changeZip(mutator) {
  const bytes = Buffer.from(base64, 'base64');
  mutator(bytes);
  return bytes.toString('base64');
}

function renameRoot(bytes, replacement) {
  assert.equal(replacement.length, 'package.json'.length);
  for (let at = 0; (at = bytes.indexOf('package.json', at)) >= 0; at += replacement.length) {
    bytes.write(replacement, at);
  }
}

// Build a valid uncompressed ZIP in memory for exact byte-boundary checks.
function zipOfSize(size) {
  const name = Buffer.from('package.json');
  const data = Buffer.from('{}' + ' '.repeat(size - 30 - 46 - 22 - 2 * name.length - 2));
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]).toString('base64');
}

test('publishing module re-exports the shared helpers without divergent implementations', () => {
  assert.equal(digest, helpers.digest);
  assert.equal(validateUploadUrl, helpers.validateUploadUrl);
  assert.equal(createLedger, helpers.createLedger);
});

test('publishing tool schemas have exactly the four bounded operations', () => {
  assert.deepEqual(EXTRA_TOOLS.map(tool => tool.name), [
    'cookiejar_owned_sites', 'cookiejar_operation_status',
    'cookiejar_create_site', 'cookiejar_deploy_site'
  ]);
  assert.equal(EXTRA_TOOLS.filter(tool => tool.annotations.readOnlyHint).length, 2);
  assert.ok(EXTRA_TOOLS.every(tool => tool.inputSchema.additionalProperties === false));
  assert.equal(EXTRA_TOOLS.find(tool => tool.name === 'cookiejar_deploy_site').annotations.destructiveHint, true);
});

test('synthetic root ZIP accepted; malformed, empty, truncated and oversized encodings refused', () => {
  assert.ok(validateZip(base64).length > 0);
  for (const value of ['', 'not zip', 'A'.repeat(800000), 42, base64.slice(0, -4)]) {
    assert.throws(() => validateZip(value));
  }
});

test('decoded ZIP size is bounded to 512 KiB even when the base64 lengths are identical', () => {
  const maximum = zipOfSize(512 * 1024);
  const oversized = zipOfSize(512 * 1024 + 1);
  assert.equal(maximum.length, oversized.length);
  assert.equal(validateZip(maximum).length, 512 * 1024);
  assert.throws(() => validateZip(oversized), /ZIP too large/);
});

test('missing root manifest, traversal, secret paths and local-directory mismatch are refused', () => {
  for (const replacement of ['renamed.json', '../evil.json', '.env/secrets', 'C:/evil.json']) {
    assert.throws(() => validateZip(changeZip(bytes => renameRoot(bytes, replacement))));
  }
  assert.throws(() => validateZip(changeZip(bytes => {
    bytes.write('renamed.json', bytes.indexOf('package.json'));
  })));
});

test('symlink, encrypted, unsupported-compression and overexpanded ZIP entries are refused', () => {
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (const mutate of [
    (bytes, at) => bytes.writeUInt32LE((0xa1ff << 16) >>> 0, at + 38),
    (bytes, at) => bytes.writeUInt16LE(1, at + 8),
    (bytes, at) => bytes.writeUInt16LE(99, at + 10),
    (bytes, at) => bytes.writeUInt32LE(10 * 1024 * 1024 + 1, at + 24)
  ]) {
    assert.throws(() => validateZip(changeZip(bytes => mutate(bytes, bytes.indexOf(centralSignature)))));
  }
});

test('upload target requires the configured host, exact site/deploy path and signed HTTPS', () => {
  assert.equal(validateUploadUrl(uploadUrl, siteId, deployId), uploadUrl);
  const invalid = [
    uploadUrl.replace(uploadHost, 'other.example.invalid'),
    uploadUrl.replace(`/${siteId}/`, '/other-site/'),
    uploadUrl.replace(`/${deployId}/`, '/other-deployment/'),
    uploadUrl.replace('https:', 'http:'),
    uploadUrl.replace('/source.zip', '/other.zip'),
    uploadUrl.replace(uploadHost, `${uploadHost}:8443`),
    uploadUrl.replace('https://', 'https://user:password@'),
    uploadUrl + '#fragment',
    uploadUrl.replace('X-Amz-Signature', 'Not-A-Signature'),
    uploadUrl.replace('AWS4-HMAC-SHA256', 'other-algorithm')
  ];
  for (const value of invalid) assert.throws(() => validateUploadUrl(value, siteId, deployId));
});

test('Cookiejar activation and credential gates fail closed before any upstream or ledger change', async () => {
  const args = await deployArgs();
  for (const config of [
    {...env, COOKIEJAR_ENABLED: undefined}, {...env, COOKIEJAR_ENABLED: 'false'},
    {...env, COOKIEJAR_ENABLED: true}, {...env, HUB_KEY: undefined}, {...env, HUB_KEY: ''}
  ]) {
    for (const [name, input] of [
      ['cookiejar_owned_sites', {}], ['cookiejar_create_site', {operationId, name: 'Example'}],
      ['cookiejar_deploy_site', args]
    ]) {
      let calls = 0;
      const store = ledger();
      await assert.rejects(() => extraCall(name, input, config, () => {calls++;}, readJson, store));
      assert.equal(calls, 0);
      assert.equal(store.rows.size, 0);
    }
  }
});

test('disabled writes prevent create and deploy without affecting read-only owned-site access', async () => {
  let calls = 0;
  const config = {...env, WRITES_ENABLED: 'false'};
  const fetcher = async () => {calls++; return Response.json({sites: []});};
  for (const [name, args] of [
    ['cookiejar_create_site', {operationId, name: 'Example'}],
    ['cookiejar_deploy_site', await deployArgs()]
  ]) {
    await assert.rejects(() => extraCall(name, args, config, fetcher, readJson, ledger()));
  }
  assert.equal(calls, 0);
  assert.deepEqual(await extraCall('cookiejar_owned_sites', {}, config, fetcher, readJson), {sites: []});
  assert.equal(calls, 1);
});

test('owned sites use only fixed-origin authenticated GET and return allowlisted metadata', async () => {
  for (const shape of ['array', 'object']) {
    const fetcher = async (url, init) => {
      assert.equal(url, origin + '/sites');
      assert.equal(init.method, 'GET');
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${env.HUB_KEY}`);
      assert.equal(init.redirect, 'manual');
      const sites = [{siteId, name: 'Example', token: 'FAKE_RESPONSE_TOKEN', environment: {PRIVATE: 'fake'}}];
      return Response.json(shape === 'array' ? sites : {sites});
    };
    assert.deepEqual(await extraCall('cookiejar_owned_sites', {}, env, fetcher, readJson), {
      sites: [{siteId, name: 'Example'}]
    });
  }
  await assert.rejects(() => extraCall('cookiejar_owned_sites', {}, env, async () => Response.json({sites: {}}), readJson));
});

test('operation status returns durable state and never retries an external call', async () => {
  const store = ledger();
  const fetcher = () => {throw Error('Operation status must not contact upstream');};
  assert.deepEqual(await extraCall('cookiejar_operation_status', {operationId}, env, fetcher, readJson, store), {
    operationId, state: 'not_found'
  });
  await store.claim(operationId, 'synthetic-fingerprint');
  await store.set(operationId, 'needs_reconciliation', {siteId, deployId, phase: 'starting'});
  assert.deepEqual(await extraCall('cookiejar_operation_status', {operationId}, {...env, WRITES_ENABLED: 'false'}, fetcher, readJson, store), {
    operationId, state: 'needs_reconciliation', result: {siteId, deployId, phase: 'starting'}
  });
  assert.equal((await extraCall('cookiejar_operation_status', {operationId}, {}, fetcher, readJson, store)).state, 'needs_reconciliation');
});

test('invalid operation ID or missing durable storage is rejected before upstream', async () => {
  let calls = 0;
  const fetcher = () => {calls++;};
  await assert.rejects(() => extraCall('cookiejar_create_site', {operationId: 'invalid', name: 'Example'}, env, fetcher, readJson, ledger()));
  await assert.rejects(() => extraCall('cookiejar_create_site', {operationId, name: 'Example'}, env, fetcher, readJson));
  assert.equal(calls, 0);
});

test('create strips private response fields, replays once, and rejects a changed payload', async () => {
  let posts = 0;
  const store = ledger();
  const fetcher = async (url, init) => {
    assert.equal(url, origin + '/sites');
    if (init.method === 'GET') return Response.json({sites: []});
    posts++;
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), {name: 'Example project'});
    assert.equal(init.redirect, 'manual');
    return Response.json({siteId: 'new-example-site', siteUrl: 'https://new-site.example.invalid/', token: 'FAKE_RESPONSE_TOKEN'});
  };
  const args = {operationId, name: ' Example project '};
  const first = await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store);
  assert.equal(first.state, 'completed');
  assert.equal(first.result.siteId, 'new-example-site');
  assert.equal(first.result.siteUrl, 'https://new-site.example.invalid/');
  assert.ok(!JSON.stringify(first).includes('FAKE_RESPONSE_TOKEN'));
  assert.ok(!JSON.stringify([...store.rows.values()]).includes('FAKE_RESPONSE_TOKEN'));
  const again = await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.result, first.result);
  assert.equal(posts, 1);
  await assert.rejects(() => extraCall('cookiejar_create_site', {...args, name: 'Other'}, env, fetcher, readJson, store));
  assert.equal(posts, 1);
});

test('create returns only a provided valid HTTPS site URL and does not invent one', async () => {
  for (const response of [
    {siteId},
    {siteId, siteUrl: 'https://site.example.invalid/path'},
    {siteId, url: 'https://alternate-site.example.invalid/'}
  ]) {
    const fetcher = async (_, init) => Response.json(init.method === 'GET' ? [] : response);
    const result = await extraCall('cookiejar_create_site', {operationId, name: 'Example'}, env, fetcher, readJson, ledger());
    assert.equal(result.state, 'completed');
    assert.deepEqual(result.result, {
      siteId, ...(response.siteUrl || response.url ? {siteUrl: response.siteUrl || response.url} : {})
    });
  }
});

test('unsafe returned site URLs preserve the known site ID but require reconciliation without replay', async () => {
  for (const siteUrl of [
    'http://site.example.invalid/', 'javascript:alert(1)', 'not a URL',
    'https://user:password@site.example.invalid/',
    'https://site.example.invalid/?token=FAKE_RESPONSE_TOKEN',
    'https://site.example.invalid/#FAKE_RESPONSE_TOKEN'
  ]) {
    let mutations = 0;
    const store = ledger();
    const fetcher = async (_, init) => {
      if (init.method === 'GET') return Response.json([]);
      mutations++;
      return Response.json({siteId, siteUrl});
    };
    const args = {operationId, name: 'Example'};
    const result = await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store);
    assert.equal(result.state, 'needs_reconciliation');
    assert.equal(result.result.siteId, siteId);
    assert.equal(result.result.siteUrl, undefined);
    assert.equal((await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store)).replayed, true);
    assert.equal(mutations, 1);
    assert.ok(!JSON.stringify([...store.rows.values()]).includes(siteUrl));
  }
});

test('full deploy verifies ownership, sends exact bytes without API credentials, and starts only once', async () => {
  const calls = [];
  const store = ledger();
  const args = {...await deployArgs(), outputDir: 'dist/public'};
  const fetcher = async (url, init) => {
    calls.push({url, init});
    assert.equal(init.redirect, 'manual');
    const headers = new Headers(init.headers);
    if (url === uploadUrl) {
      assert.equal(init.method, 'PUT');
      assert.equal(headers.get('authorization'), null);
      assert.equal(headers.get('x-site'), null);
      assert.equal(headers.get('content-type'), 'application/zip');
      assert.deepEqual(Buffer.from(init.body), Buffer.from(base64, 'base64'));
      return new Response(null, {status: 200});
    }
    assert.equal(new URL(url).origin, origin);
    assert.equal(headers.get('authorization'), `Bearer ${env.HUB_KEY}`);
    if (url === origin + '/sites') return Response.json({sites: [{siteId}]});
    assert.equal(headers.get('x-site'), siteId);
    if (url === origin + '/deploy') {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), {kind: 'static', outputDir: 'dist/public'});
      return Response.json({deployId, source: {uploadUrl}});
    }
    assert.equal(url, `${origin}/deploy/${deployId}/start`);
    assert.equal(init.method, 'POST');
    return Response.json({status: 'starting'});
  };
  const result = await extraCall('cookiejar_deploy_site', args, env, fetcher, readJson, store);
  assert.deepEqual(result, {operationId, state: 'completed', result: {siteId, deployId, status: 'started'}});
  assert.equal(calls.length, 4);
  assert.equal((await extraCall('cookiejar_deploy_site', args, env, fetcher, readJson, store)).replayed, true);
  assert.equal(calls.length, 4);
  const stored = JSON.stringify([...store.rows.values()]);
  assert.ok(!stored.includes('X-Amz'));
  assert.ok(!stored.includes(base64));
  assert.ok(!stored.includes(env.HUB_KEY));
});

test('non-owned deployment target is rejected without claiming or mutating', async () => {
  let calls = 0;
  const store = ledger();
  const fetcher = async (_, init) => {calls++; assert.equal(init.method, 'GET'); return Response.json({sites: []});};
  await assert.rejects(() => deployArgs().then(args => extraCall('cookiejar_deploy_site', args, env, fetcher, readJson, store)));
  assert.equal(calls, 1);
  assert.equal(store.rows.size, 0);
});

test('mismatched source hash, unsafe output directory and bad deployment identifiers are rejected before upstream', async () => {
  let calls = 0;
  const fetcher = () => {calls++;};
  const args = await deployArgs();
  for (const change of [
    {sourceSha256: '0'.repeat(64)}, {siteId: '../other'}, {kind: 'unknown'},
    {outputDir: '../dist'}, {outputDir: '/dist'}, {outputDir: 'dist//public'},
    {kind: 'server', outputDir: 'dist'}
  ]) {
    await assert.rejects(() => extraCall('cookiejar_deploy_site', {...args, ...change}, env, fetcher, readJson, ledger()));
  }
  assert.equal(calls, 0);
});

test('concurrent operation claim does not execute the mutation twice', async () => {
  let mutations = 0;
  const store = {...ledger(), async claim() {return false;}};
  const fetcher = async (_, init) => {
    if (init.method !== 'GET') mutations++;
    return Response.json({sites: []});
  };
  const result = await extraCall('cookiejar_create_site', {operationId, name: 'Example'}, env, fetcher, readJson, store);
  assert.deepEqual(result, {operationId, state: 'in_progress', replayed: true});
  assert.equal(mutations, 0);
});

test('uncertain create is persisted without leaking errors and is never retried', async () => {
  for (const failure of ['network', 'server', 'redirect']) {
    const store = ledger();
    let posts = 0;
    const fetcher = async (_, init) => {
      if (init.method === 'GET') return Response.json([]);
      posts++;
      if (failure === 'network') throw Error(env.HUB_KEY);
      return new Response(env.HUB_KEY, {status: failure === 'server' ? 500 : 302});
    };
    const args = {operationId, name: 'Example'};
    const result = await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store);
    assert.equal(result.state, 'needs_reconciliation');
    assert.equal(result.result.phase, 'creating');
    assert.equal((await extraCall('cookiejar_create_site', args, env, fetcher, readJson, store)).replayed, true);
    assert.equal(posts, 1);
    assert.ok(!JSON.stringify([...store.rows.values()]).includes(env.HUB_KEY));
  }
});

test('untrusted upload destination blocks upload and start while retaining deployment ID for reconciliation', async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    if (url.endsWith('/sites')) return Response.json([{siteId}]);
    return Response.json({deployId, source: {uploadUrl: 'https://other.example.invalid/source.zip'}});
  };
  const result = await extraCall('cookiejar_deploy_site', await deployArgs(), env, fetcher, readJson, ledger());
  assert.equal(result.state, 'needs_reconciliation');
  assert.equal(result.result.deployId, deployId);
  assert.equal(calls, 2);
});

test('upload or start failures retain their phase and never resume on duplicate calls', async () => {
  for (const phase of ['uploading', 'starting']) {
    let calls = 0;
    const store = ledger();
    const fetcher = async (url, init) => {
      calls++;
      if (url.endsWith('/sites')) return Response.json([{siteId}]);
      if (url.endsWith('/deploy')) return Response.json({deployId, source: {uploadUrl}});
      if (init.method === 'PUT') return new Response(null, {status: phase === 'uploading' ? 503 : 200});
      throw Error('Synthetic start interruption');
    };
    const args = await deployArgs();
    const result = await extraCall('cookiejar_deploy_site', args, env, fetcher, readJson, store);
    assert.equal(result.state, 'needs_reconciliation');
    assert.equal(result.result.phase, phase);
    assert.equal(result.result.deployId, deployId);
    const firstCalls = calls;
    assert.equal((await extraCall('cookiejar_deploy_site', args, env, fetcher, readJson, store)).replayed, true);
    assert.equal(calls, firstCalls);
    assert.equal(calls, phase === 'uploading' ? 3 : 4);
  }
});

test('publishing calls require the managed owner and reject extra arguments before upstream', async () => {
  let calls = 0;
  const handler = createHandler(() => {calls++;});
  const args = {operationId, name: 'Example'};
  for (const user of ['other-owner', null]) {
    assert.equal((await handler(rpc('cookiejar_create_site', args, user), env)).status, 403);
    assert.equal((await handler(rpc('cookiejar_owned_sites', {}, user), env)).status, 403);
  }
  for (const extra of [{url: 'https://other.example.invalid'}, {constructor: 'unexpected'}, {apiKey: 'FAKE_OVERRIDE'}]) {
    const result = await (await handler(rpc('cookiejar_create_site', {...args, ...extra}), env)).json();
    assert.equal(result.error.code, -32602);
  }
  const result = await (await handler(rpc('cookiejar_deploy_site', {...await deployArgs(), action: 'delete'}), env)).json();
  assert.equal(result.error.code, -32602);
  assert.equal(calls, 0);
});

test('worker routes owned-site reads through the helper and sanitizes returned credentials', async () => {
  let calls = 0;
  const handler = createHandler(async (url) => {
    calls++;
    assert.equal(url, origin + '/sites');
    return Response.json({sites: [{siteId, name: 'Example', token: 'FAKE_RESPONSE_TOKEN'}]});
  });
  const response = await (await handler(rpc('cookiejar_owned_sites'), env)).json();
  assert.equal(response.result.isError, false);
  assert.deepEqual(JSON.parse(response.result.content[0].text), {sites: [{siteId, name: 'Example'}]});
  assert.equal(calls, 1);
});

test('discovery exposes 7 read-only or 11 enabled tools and no extra destructive operations', async () => {
  const handler = createHandler(() => {throw Error('Discovery must not contact upstream');});
  const request = () => new Request('https://bridge.example.invalid/mcp', {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'})
  });
  const off = (await (await handler(request(), {})).json()).result.tools;
  const on = (await (await handler(request(), env)).json()).result.tools;
  assert.equal(off.length, 7);
  assert.ok(off.every(tool => tool.annotations.readOnlyHint));
  assert.equal(on.length, 11);
  assert.equal(on.filter(tool => tool.annotations.readOnlyHint).length, 7);
  assert.equal(new Set(on.map(tool => tool.name)).size, 11);
  assert.ok(on.every(tool => !/(delete|rotate|admin|environment)/i.test(tool.name)));
  for (const tool of EXTRA_TOOLS) assert.ok(on.some(item => item.name === tool.name));
  const response = await (await handler(rpc('cookiejar_create_site', {operationId, name: 'Example'}), {...env, WRITES_ENABLED: 'false'})).json();
  assert.equal(response.error.code, -32002);
});
