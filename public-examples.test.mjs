import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICES} from './services.example.mjs';

// Positive constraints keep the public registry limited to the documented
// provider example and a fictional API. Review this contract before adding one.
test('public registry contains only the documented provider and synthetic RPC example',()=>{
 assert.deepEqual(Object.keys(SERVICES).sort(),['cookiejar','example_rpc']);
 const rpc=SERVICES.example_rpc;
 assert.equal(rpc.baseUrl,undefined);
 assert.equal(rpc.baseUrlEnv,'EXAMPLE_RPC_API_URL');
 assert.equal(rpc.enableEnv,'EXAMPLE_RPC_ENABLED');
 assert.equal(rpc.credentialEnv,'EXAMPLE_RPC_KEY');
 assert.equal(rpc.authHeader,'X-Example-Key');
 assert.equal(rpc.authPrefix,'');
 assert.equal(rpc.rpc,true);
 assert.deepEqual(rpc.readActions,['read_record','list_records']);
 assert.deepEqual(rpc.writeActions,['write_record','delete_record']);
 assert.match(rpc.reason,/Fictional example only/);
});

test('RPC test fixtures use only fictional settings, credentials, actions, and hosts',()=>{
 const source=readFileSync(new URL('./generic.test.mjs',import.meta.url),'utf8');
 const settingNames=[...new Set(source.match(/\b[A-Z][A-Z0-9_]+_(?:ENABLED|API_URL|KEY|TOKEN)\b/g))].sort();
 assert.deepEqual(settingNames,['COOKIEJAR_ENABLED','EXAMPLE_RPC_API_URL','EXAMPLE_RPC_ENABLED','EXAMPLE_RPC_KEY','HUB_KEY','WRITES_ENABLED']);
 const serviceIds=[...new Set([...source.matchAll(/serviceId:'([^']+)'/g)].map(match=>match[1]))].sort();
 assert.deepEqual(serviceIds,['cookiejar','example_rpc']);
 const urls=[...source.matchAll(/https?:\/\/[^'"\s]+/g)].map(match=>new URL(match[0]));
 assert.ok(urls.length>0);
 assert.ok(urls.every(url=>url.hostname.endsWith('.invalid')),'Fixture URLs must use reserved .invalid hosts');
 assert.match(source,/DUMMY_EXAMPLE_RPC_SECRET/);
});

test('public setup guides preserve access prerequisites and synthetic example labels',()=>{
 for(const path of ['README.md','SETUP.md','agent-handoff.md','examples/README.md']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(source,/Cookiejar/);
  assert.match(source,/waitlist-stage/);
 }
 for(const path of ['README.md','SETUP.md','agent-handoff.md']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(source,/example_rpc/);
  assert.match(source,/fictional/);
 }
});
