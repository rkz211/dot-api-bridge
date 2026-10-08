import {SERVICES} from './services.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './worker.mjs';
import {genericCall} from './generic.mjs';
import {validateUploadUrl, digest} from './helpers.mjs';
const env = {COOKIEJAR_ENABLED: 'true', HUB_KEY: 'FAKE_TEST_CREDENTIAL'};
const rpc = (name, args = {}, user = 'test-owner') => new Request('https://bridge.example.invalid/mcp', {
  method: 'POST', headers: {'content-type': 'application/json', ...(user === null ? {} : {'oai-authenticated-user-id': user})},
  body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})
});
test('every tool call rejects a missing or blank managed identity before dispatch', async () => {
  const handler = createHandler(() => {throw Error('must not call');});
  const request = new Request('https://bridge.example.invalid/mcp', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const list = (await (await handler(request, {...env, WRITES_ENABLED:'true'})).json()).result.tools;
  for (const tool of list) {
    for (const user of [null, '', ' ', '\t']) {
      const response = await handler(rpc(tool.name, {}, user), {...env, WRITES_ENABLED:'true'});
      assert.equal(response.status, 403, tool.name);
      assert.deepEqual((await response.json()).error, {code:-32001, message:'Authentication required'});
    }
  }
});
test('Sites-managed identity works without a manual owner setting and ignores legacy values', async () => {
  let calls = 0;
  const handler = createHandler(async () => {calls++; return Response.json({sites:[]});});
  for (const legacy of [{}, {OWNER_USER_ID:''}, {OWNER_USER_ID:'stale-other-owner'}]) {
    const config = {...env, ...legacy};
    for (const [name, args] of [
      ['bridge_services', {}],
      ['bridge_api_read', {serviceId:'cookiejar', method:'GET', path:'/sites'}],
      ['cookiejar_owned_sites', {}]
    ]) {
      const response = await handler(rpc(name, args), config);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).result.isError, false);
    }
  }
  assert.equal(calls, 6);
});
test('connection info returns managed authentication only, independent of legacy owner settings', async () => {
  for (const config of [{}, env, {...env, OWNER_USER_ID:'stale-other-owner'}]) {
    const response = await createHandler()(rpc('bridge_connection_info'), config);
    const value = JSON.parse((await response.json()).result.content[0].text);
    assert.deepEqual(value, {authenticated:true, authentication:'sites-managed', userId:'test-owner'});
  }
});
test('write tools are hidden and refused while writes disabled', async () => {
  const handler = createHandler(() => {throw Error('must not call');});
  const request = new Request('https://bridge.example.invalid/mcp', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const list = (await (await handler(request, env)).json()).result.tools;
  assert.ok(list.every(t => t.annotations.readOnlyHint));
  const operationId = '12345678-1234-1234-1234-123456789abc';
  for (const [name, args] of [
    ['bridge_api_write', {serviceId:'cookiejar', method:'POST', path:'/sites', operationId}],
    ['bridge_api_upload', {serviceId:'cookiejar', siteId:'site', deployId:'deploy', uploadUrl:'https://example.invalid/source.zip', bodyBase64:'', sha256:'0'.repeat(64), operationId}],
    ['cookiejar_create_site', {name:'Synthetic site', operationId}],
    ['cookiejar_deploy_site', {siteId:'site', sourceZipBase64:'', sourceSha256:'0'.repeat(64), kind:'static', operationId}]
  ]) {
    const response = await handler(rpc(name, args), env);
    assert.equal((await response.json()).error.code, -32002, name);
  }
});
test('managed authentication does not bypass disabled services or missing credentials', async () => {
  let calls = 0;
  const handler = createHandler(() => {calls++; throw Error('must not call');});
  for (const config of [{...env,COOKIEJAR_ENABLED:'false'}, {...env,HUB_KEY:''}]) {
    for (const [name, args] of [
      ['bridge_api_read', {serviceId:'cookiejar',method:'GET',path:'/sites'}],
      ['cookiejar_owned_sites', {}]
    ]) {
      const response = await handler(rpc(name, args), config);
      assert.equal((await response.json()).error.code, -32006, name);
    }
  }
  assert.equal(calls, 0);
});
test('managed authentication preserves generic and dedicated response credential redaction', async () => {
  const handler = createHandler(async () => Response.json({sites:[{siteId:'site',name:env.HUB_KEY,token:'SYNTHETIC_SITE_TOKEN'}],note:env.HUB_KEY,session:'SYNTHETIC_SESSION'}));
  for (const [name, args] of [
    ['bridge_api_read', {serviceId:'cookiejar',method:'GET',path:'/sites'}],
    ['cookiejar_owned_sites', {}]
  ]) {
    const response = await handler(rpc(name, args), env);
    const text = await response.text();
    assert.equal(JSON.parse(text).result.isError, false);
    assert.ok(!text.includes(env.HUB_KEY));
    assert.ok(!text.includes('SYNTHETIC_SITE_TOKEN'));
    assert.ok(!text.includes('SYNTHETIC_SESSION'));
  }
});
test('required fields, prototype names, malformed and oversized JSON are rejected', async () => {
  const handler = createHandler();
  for (const args of [{serviceId:'cookiejar'}, {serviceId:'cookiejar',method:'GET',path:'/me',constructor:'bad'}]) {
    assert.equal((await (await handler(rpc('bridge_api_read', args), env)).json()).error.code, -32602);
  }
  for (const body of ['{', ' '.repeat(1048577)]) {
    const request = new Request('https://bridge.example.invalid/mcp', {method:'POST',headers:{'content-type':'application/json'},body});
    assert.equal((await (await handler(request, env)).json()).error.code, -32700);
  }
});
test('raw exceptions do not escape the worker', async () => {
  const handler = createHandler(() => {throw Error(env.HUB_KEY);});
  const response = await handler(rpc('bridge_api_read', {serviceId:'cookiejar',method:'GET',path:'/me'}), env);
  assert.ok(!(await response.text()).includes(env.HUB_KEY));
});
test('upload URL is fixed-host and exact-path with no user info or fragment', () => {
  const good = `https://${SERVICES.cookiejar.uploadHost}/site/deploys/deploy/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE`;
  assert.equal(validateUploadUrl(good, 'site', 'deploy'), good);
  for (const bad of [good.replace(SERVICES.cookiejar.uploadHost,'evil.invalid'), good+'#fragment', good.replace('/site/','/other/'), good.replace('https://','https://user@')]) {
    assert.throws(() => validateUploadUrl(bad, 'site', 'deploy'));
  }
});
test('upload sends no API credential and duplicate ID never repeats the PUT', async () => {
  const rows = new Map(); const ledger = {async get(id){return rows.get(id);}, async claim(id,fingerprint){if(rows.has(id))return false;rows.set(id,{fingerprint,state:'in_progress'});return true;},async set(id,state,result){Object.assign(rows.get(id),{state,result:JSON.stringify(result)});}};
  const bytes = new TextEncoder().encode('synthetic upload');
  const args = {serviceId:'cookiejar',siteId:'site',deployId:'deploy',uploadUrl:`https://${SERVICES.cookiejar.uploadHost}/site/deploys/deploy/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE`,bodyBase64:btoa('synthetic upload'),sha256:await digest(bytes),operationId:'12345678-1234-1234-1234-123456789abc'};
  let calls = 0; const fetcher = async (_, init) => {calls++; assert.equal(new Headers(init.headers).get('authorization'),null); assert.equal(init.redirect,'manual'); return new Response(null,{status:204});};
  const config = {...env,WRITES_ENABLED:'true'};
  assert.equal((await genericCall('bridge_api_upload',args,config,fetcher,ledger)).state,'completed');
  assert.equal((await genericCall('bridge_api_upload',args,config,fetcher,ledger)).replayed,true);
  assert.equal(calls,1);
  await assert.rejects(() => genericCall('bridge_api_upload',args,{...config,COOKIEJAR_ENABLED:'false'},fetcher,ledger));
  await assert.rejects(() => genericCall('bridge_api_upload',args,{...config,HUB_KEY:''},fetcher,ledger));
});
