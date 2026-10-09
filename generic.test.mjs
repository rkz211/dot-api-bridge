import {SERVICES} from './services.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {genericCall,prepare,clean,decodeBody} from './generic.mjs';import {createHandler} from './worker.mjs';
const env={COOKIEJAR_ENABLED:'true',HUB_KEY:'DUMMY_COOKIEJAR_SECRET',EXAMPLE_RPC_ENABLED:'true',EXAMPLE_RPC_API_URL:'https://records.example.invalid',EXAMPLE_RPC_KEY:'DUMMY_EXAMPLE_RPC_SECRET'};const id='12345678-1234-1234-1234-123456789abc';const read={serviceId:'cookiejar',method:'GET',path:'/me',siteId:'example-site'};
function ledger(){const rows=new Map();return {rows,async get(k){return rows.get(k)},async claim(k,f){if(rows.has(k))return false;rows.set(k,{fingerprint:f,state:'in_progress'});return true;},async set(k,s,r){Object.assign(rows.get(k),{state:s,result:JSON.stringify(r)});}}}
test('generic GET/HEAD uses fixed service auth and allows only safe headers',async()=>{for(const method of ['GET','HEAD']){const r=await genericCall('bridge_api_read',{...read,method,headers:{Accept:'application/json'}},env,async(u,o)=>{assert.equal(u,SERVICES.cookiejar.baseUrl+'/me');assert.equal(o.headers.get('Authorization'),'Bearer '+env.HUB_KEY);assert.equal(o.headers.get('X-Site'),'example-site');assert.equal(o.redirect,'manual');return Response.json({ok:true});});assert.equal(r.status,200);}});
test('SSRF/traversal/origin/query/header injection and credential routes rejected',()=>{for(const path of ['https://evil.invalid','//evil.invalid','/../key','/%2e%2e/key','/%252e/key','/a\\b','/x?target=evil','/x#evil','/key','/env','/sites/x/rotate','/admin/sites','/v1/auth','/sites/x/env'])assert.throws(()=>prepare({...read,path},env));for(const header of ['Authorization','X-Site','Host','Cookie','Proxy-Authorization','X-Forwarded-Host'])assert.throws(()=>prepare({...read,headers:{[header]:'bad'}},env));assert.throws(()=>prepare({...read,query:{token:'secret'}},env));});
test('all generic write methods use durable ledger and never retry',async()=>{for(const method of ['POST','PUT','PATCH','DELETE']){let n=0;const l=ledger(),args={serviceId:'cookiejar',method,path:'/c/test/item',siteId:'s1',operationId:id,bodyJson:{value:'approved'}};const f=async(u,o)=>{n++;assert.equal(o.method,method);return Response.json({ok:true});};assert.equal((await genericCall('bridge_api_write',args,env,f,l)).state,'completed');assert.equal((await genericCall('bridge_api_write',args,env,f,l)).replayed,true);assert.equal(n,1);await assert.rejects(()=>genericCall('bridge_api_write',{...args,path:'/c/other/item'},env,f,l));}});
test('network uncertainty and HTTP500 persist reconciliation, never replay mutation',async()=>{for(const failure of ['network','500']){let n=0;const l=ledger(),args={serviceId:'cookiejar',method:'POST',path:'/sites',bodyJson:{name:'Requested'},operationId:id};const f=async()=>{n++;if(failure==='network')throw Error(env.HUB_KEY);return Response.json({error:env.HUB_KEY},{status:500});};const r=await genericCall('bridge_api_write',args,env,f,l);assert.equal(r.state,'needs_reconciliation');await genericCall('bridge_api_write',args,env,f,l);assert.equal(n,1);assert.ok(!JSON.stringify([...l.rows.values()]).includes(env.HUB_KEY));}});
test('credential response fields and exact configured secrets are redacted before storage',async()=>{const l=ledger();const r=await genericCall('bridge_api_write',{serviceId:'cookiejar',method:'POST',path:'/sites',bodyJson:{name:'Requested'},operationId:id},env,async()=>Response.json({siteId:'s',token:'new token',nested:{secretAccessKey:'new credential',text:env.HUB_KEY}}),l);assert.equal(r.result.response.bodyJson.token,'[REDACTED]');assert.equal(r.result.response.bodyJson.nested.secretAccessKey,'[REDACTED]');assert.ok(!JSON.stringify([...l.rows.values()]).includes('new token'));});
test('JSON/text/base64 request bodies supported with strict exclusivity and bounds',()=>{assert.equal(prepare({...read,method:'POST',bodyText:'hello'},env).requestBody,'hello');assert.equal(prepare({...read,method:'PUT',bodyBase64:btoa('hello')},env).requestBody.length,5);assert.throws(()=>prepare({...read,method:'POST',bodyText:'a',bodyJson:{}},env));assert.throws(()=>prepare({...read,method:'POST',bodyText:'x'.repeat(524289)},env));assert.throws(()=>prepare({...read,method:'POST',bodyJson:{nested:{apiKey:'bad'}}},env));});
test('redirect never followed and binary or oversized responses handled safely',async()=>{let n=0;const redirect=await genericCall('bridge_api_read',read,env,async()=>{n++;return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});});assert.equal(redirect.redirectRefused,true);assert.equal(n,1);const binary=await genericCall('bridge_api_read',read,env,async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'application/octet-stream'}}));assert.equal(binary.bodyBase64,'AQID');await assert.rejects(()=>genericCall('bridge_api_read',read,env,async()=>new Response('x'.repeat(524289))));await assert.rejects(()=>genericCall('bridge_api_read',read,env,async()=>new Response(env.HUB_KEY,{headers:{'content-type':'application/octet-stream'}})));});
test('Synthetic RPC example disabled by default, uses its own token after configured',async()=>{const a={serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action:'read_record'}};await assert.rejects(()=>genericCall('bridge_api_read',a,{HUB_KEY:'cookie-only'},()=>{throw Error('must not call')}));const r=await genericCall('bridge_api_read',a,env,async(u,o)=>{assert.equal(u,'https://records.example.invalid/');assert.equal(o.headers.get('X-Example-Key'),env.EXAMPLE_RPC_KEY);assert.equal(o.headers.get('Authorization'),null);return Response.json({ok:true,records:[]});});assert.equal(r.bodyJson.ok,true);});
test('Synthetic RPC example read POST action allowlist excludes mutation and credential actions',async()=>{for(const action of ['write_record','delete_record','mark_seen','rotate_key','unreviewed_action','UNKNOWN'])await assert.rejects(()=>genericCall('bridge_api_read',{serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action}},env,()=>{throw Error('must not call')}));assert.throws(()=>prepare({serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action:'write_record',sourceUrl:'https://evil.invalid'}},env));});
test('synthetic RPC rejects unknown actions, method/path/query overrides, and missing credentials',async()=>{
 const args={serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action:'read_record'}};
 for(const override of [{method:'GET'},{path:'/records'},{query:{target:'other'}},{bodyJson:{}},{bodyJson:{action:'rotate_key'}},{bodyJson:{action:'unreviewed_action'}}]){
  assert.throws(()=>prepare({...args,...override},env));
 }
 const settings={...env,EXAMPLE_RPC_KEY:undefined};
 await assert.rejects(()=>genericCall('bridge_api_read',args,settings,()=>{throw Error('must not call')}),/credential not configured/);
});
test('synthetic RPC writes retain credential isolation, redaction, and durable replay protection',async()=>{
 const args={serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action:'write_record',recordId:'synthetic-record',value:'approved'},operationId:id};
 let calls=0;const l=ledger();
 const fetcher=async(url,options)=>{
  calls++;assert.equal(url,'https://records.example.invalid/');assert.equal(options.headers.get('X-Example-Key'),env.EXAMPLE_RPC_KEY);assert.equal(options.headers.get('Authorization'),null);
  assert.equal(options.redirect,'manual');assert.equal(JSON.parse(options.body).action,'write_record');
  return Response.json({ok:true,message:env.EXAMPLE_RPC_KEY,token:'new synthetic credential'});
 };

 const result=await genericCall('bridge_api_write',args,env,fetcher,l);
 assert.equal(result.state,'completed');assert.equal(result.result.response.bodyJson.message,'[REDACTED]');assert.equal(result.result.response.bodyJson.token,'[REDACTED]');
 assert.equal((await genericCall('bridge_api_write',args,env,fetcher,l)).replayed,true);
 await assert.rejects(()=>genericCall('bridge_api_write',{...args,bodyJson:{...args.bodyJson,value:'changed'}},env,fetcher,l),/different arguments/);
 assert.equal(calls,1);assert.ok(!JSON.stringify([...l.rows.values()]).includes(env.EXAMPLE_RPC_KEY));
});
test('preview does not call upstream or grant approval',async()=>{const r=await genericCall('bridge_api_preview',{serviceId:'cookiejar',method:'DELETE',path:'/c/test/item'},env,()=>{throw Error('must not call')});assert.equal(r.method,'DELETE');assert.match(r.approval,/does not authorize/);});
test('managed identity required and unknown arguments blocked for generic tools',async()=>{let n=0;const h=createHandler(()=>{n++});const request=(user,args)=>new Request('https://bridge.invalid/mcp',{method:'POST',headers:{'content-type':'application/json',...(user===null?{}:{'oai-authenticated-user-id':user})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'bridge_api_read',arguments:args}})});for(const user of [null,'',' ','\t'])assert.equal((await h(request(user,read),env)).status,403);const j=await(await h(request('owner',{...read,apiKey:'forbidden'}),env)).json();assert.equal(j.error.code,-32602);assert.equal(n,0);});

test('generic operation status reads durable state without external calls',async()=>{const l=ledger();await l.claim(id,'fingerprint');await l.set(id,'needs_reconciliation',{notice:'inspect upstream'});const r=await genericCall('bridge_operation_status',{operationId:id},env,()=>{throw Error('must not call')},l);assert.equal(r.state,'needs_reconciliation');});

test('login and session routes are blocked at every depth without upstream requests',async()=>{
 let calls=0;
 for(const path of ['/login','/login/challenge','/v1/LOGIN','/%6cogin/challenge','/session','/sessions','/v1/sign-in','/logout','/authentication']){
  await assert.rejects(()=>genericCall('bridge_api_read',{...read,path},env,()=>{calls++;}));
  await assert.rejects(()=>genericCall('bridge_api_write',{serviceId:'cookiejar',method:'POST',path,bodyJson:{accountId:'synthetic',proof:'synthetic'},operationId:id},env,()=>{calls++;},ledger()));
 }
 assert.equal(calls,0);
});
test('session-shaped input fields rejected and response fields redacted before persistence',async()=>{
 const keys=['session','sessions','sessionId','session_id','sessionToken','session_token','sessionKey','sessionSecret','SESSION-TOKEN','session.token'];
 for(const key of keys){
  assert.throws(()=>prepare({...read,query:{[key]:'synthetic'}},env));
  assert.throws(()=>prepare({...read,method:'POST',bodyJson:{nested:{[key]:'synthetic'}}},env));
 }
 const payload={nested:Object.fromEntries(keys.map(k=>[k,'sess_SYNTHETIC']))};
 const l=ledger();const result=await genericCall('bridge_api_write',{serviceId:'cookiejar',method:'POST',path:'/sites',bodyJson:{name:'Synthetic'},operationId:id},env,async()=>Response.json(payload),l);
 assert.ok(!JSON.stringify(result).includes('sess_SYNTHETIC'));
 assert.ok(!JSON.stringify([...l.rows.values()]).includes('sess_SYNTHETIC'));
 for(const key of keys)assert.equal(result.result.response.bodyJson.nested[key],'[REDACTED]');
});

 test('optional synthetic RPC endpoint is inactive unless a safe server setting is present',async()=>{
 for(const url of [undefined,'http://bad.invalid','https://user:pass@bad.invalid','https://bad.invalid:8443','https://bad.invalid/?token=x']){
 const settings={...env,EXAMPLE_RPC_API_URL:url};
 const status=await genericCall('bridge_services',{},settings,()=>{throw Error('No network');});
 assert.equal(status.services.find(s=>s.serviceId==='example_rpc').enabled,false);
 assert.throws(()=>prepare({serviceId:'example_rpc',method:'POST',path:'/',bodyJson:{action:'read_record'}},settings));
 }
});

test('base64 decoded body enforces exact 512 KiB cap despite padding rounding',()=>{
 assert.equal(decodeBody(Buffer.alloc(512*1024).toString('base64')).length,512*1024);
 assert.throws(()=>decodeBody(Buffer.alloc(512*1024+1).toString('base64')));
});

test('invalid operation IDs give safe actionable errors before storage, credential resolution or upstream calls',async()=>{
 let calls=0,dbCalls=0;const h=createHandler(()=>{calls++;throw Error('must not fetch')});
 for(const [name,args] of [
 ['bridge_api_write',{serviceId:'cookiejar',method:'POST',path:'/sites',bodyJson:{name:'Example'},operationId:'example-create-one'}],
 ['cookiejar_create_site',{name:'Example',operationId:'example-create-two'}],
 ['bridge_operation_status',{operationId:'example-create-three'}],
 ['cookiejar_operation_status',{operationId:'ABCDEFAB-1234-1234-1234-123456789ABC'}]]){
  const req=new Request('https://bridge.invalid/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'test-owner'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  const result=await(await h(req,{DB:{prepare(){dbCalls++;throw Error('must not query')}}})).json();assert.equal(result.error.code,-32602);assert.match(result.error.message,/lowercase UUID/);assert.match(result.error.message,/before any provider call/);
 }
 assert.equal(calls,0);assert.equal(dbCalls,0);
});
