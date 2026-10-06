import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './worker.mjs';
import {genericCall} from './generic.mjs';
import {validateUploadUrl, digest} from './helpers.mjs';
const env = {OWNER_USER_ID: 'test-owner', COOKIEJAR_ENABLED: 'true', HUB_KEY: 'FAKE_TEST_CREDENTIAL'};
const rpc = (name, args = {}, user = 'test-owner') => new Request('https://bridge.example.invalid/mcp', {
  method: 'POST', headers: {'content-type': 'application/json', ...(user ? {'oai-authenticated-user-id': user} : {})},
  body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})
});
test('missing owner, missing managed user, and wrong owner all fail closed', async () => {
  const handler = createHandler(() => {throw Error('must not call');});
  for (const [user, config] of [[null, env], ['stranger', env], ['test-owner', {}]]) {
    assert.equal((await handler(rpc('bridge_services', {}, user), config)).status, 403);
  }
});
test('connection bootstrap exposes only the authenticated caller and binding flags', async () => {
  const response = await createHandler()(rpc('bridge_connection_info'), {});
  const value = JSON.parse((await response.json()).result.content[0].text);
  assert.deepEqual(value, {userId: 'test-owner', ownerConfigured: false, callerMatchesOwner: false});
});
test('write tools are hidden and refused while writes disabled', async () => {
  const handler = createHandler(() => {throw Error('must not call');});
  const request = new Request('https://bridge.example.invalid/mcp', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const list = (await (await handler(request, env)).json()).result.tools;
  assert.ok(list.every(t => t.annotations.readOnlyHint));
  const response = await handler(rpc('bridge_api_write', {serviceId:'cookiejar', method:'POST', path:'/sites', operationId:'12345678-1234-1234-1234-123456789abc'}), env);
  assert.equal((await response.json()).error.code, -32002);
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
  const good = 'https://source-storage.example.invalid/site/deploys/deploy/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE';
  assert.equal(validateUploadUrl(good, 'site', 'deploy'), good);
  for (const bad of [good.replace('source-storage.example.invalid','evil.invalid'), good+'#fragment', good.replace('/site/','/other/'), good.replace('https://','https://user@')]) {
    assert.throws(() => validateUploadUrl(bad, 'site', 'deploy'));
  }
});
test('upload sends no API credential and duplicate ID never repeats the PUT', async () => {
  const rows = new Map(); const ledger = {async get(id){return rows.get(id);}, async claim(id,fingerprint){if(rows.has(id))return false;rows.set(id,{fingerprint,state:'in_progress'});return true;},async set(id,state,result){Object.assign(rows.get(id),{state,result:JSON.stringify(result)});}};
  const bytes = new TextEncoder().encode('synthetic upload');
  const args = {serviceId:'cookiejar',siteId:'site',deployId:'deploy',uploadUrl:'https://source-storage.example.invalid/site/deploys/deploy/source.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=FAKE',bodyBase64:btoa('synthetic upload'),sha256:await digest(bytes),operationId:'12345678-1234-1234-1234-123456789abc'};
  let calls = 0; const fetcher = async (_, init) => {calls++; assert.equal(new Headers(init.headers).get('authorization'),null); assert.equal(init.redirect,'manual'); return new Response(null,{status:204});};
  const config = {...env,WRITES_ENABLED:'true'};
  assert.equal((await genericCall('bridge_api_upload',args,config,fetcher,ledger)).state,'completed');
  assert.equal((await genericCall('bridge_api_upload',args,config,fetcher,ledger)).replayed,true);
  assert.equal(calls,1);
  await assert.rejects(() => genericCall('bridge_api_upload',args,{...config,COOKIEJAR_ENABLED:'false'},fetcher,ledger));
  await assert.rejects(() => genericCall('bridge_api_upload',args,{...config,HUB_KEY:''},fetcher,ledger));
});
