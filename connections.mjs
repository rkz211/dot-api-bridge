import {SERVICES} from './services.mjs';
import {digest} from './helpers.mjs';
import {genericCall} from './generic.mjs';
const ID=/^[a-z][a-z0-9_-]{1,63}$/;
const RESERVED=new Set(['constructor','prototype','__proto__']);
const FORBIDDEN_HEADERS=new Set(['host','cookie','set-cookie','origin','referer','content-length','content-type','connection','transfer-encoding','x-site']);
const BLOCKED_ROOTS=['key','admin','env','auth','oauth','credentials','tokens','secrets','password'];
const META_KEYS=['id','name','description','baseUrl','authHeader','authPrefix','keyHelpUrl','keyHelpText','accessDescription','sourceUrl','testRequest'];
const now=()=>new Date().toISOString();
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'};
export const CONNECTION_TOOLS=[
 {name:'bridge_prepare_connection',description:'Prepare non-secret connection details from verified official website/API/agent documentation. Never supply a key. The owner reviews the destination and enters their key privately in the setup page. Does not enable access or send a provider request. Generic requests do not need business-endpoint mappings.',inputSchema:schema({id:string,name:string,description:string,baseUrl:string,authHeader:string,authPrefix:string,keyHelpUrl:string,keyHelpText:string,accessDescription:string,sourceUrl:string,testRequest:{type:'object'}},['name','baseUrl','authHeader','authPrefix','accessDescription']),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'bridge_connection_status',description:'Read safe connection readiness and setup links. Never returns saved keys, key fragments, or raw provider responses.',inputSchema:schema({}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
export class ConnectionError extends Error{constructor(message,status=400,code='connection_input',providerStatus=null){super(message);this.status=status;this.code=code;this.providerStatus=providerStatus;}}
function text(value,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)||required&&!value.trim())throw new ConnectionError('Some connection details are invalid. Ask your dot to check them.');return value.trim();}
export function safeUrl(value,{base=false}={}){
 let u;try{u=new URL(value);}catch{throw new ConnectionError('Use a complete HTTPS address.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.port&&u.port!=='443')throw new ConnectionError('Use a standard HTTPS address without a password, query, or fragment.');
 const host=u.hostname.toLowerCase();if(host.endsWith('.')||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)||host.endsWith('.localhost'))throw new ConnectionError('The connection must use a public HTTPS API address.');
 if(base&&(/%2f|%5c|%2e|%25/i.test(u.pathname)||u.pathname.split('/').some(s=>s==='..'||s==='.')||/\\/.test(value)))throw new ConnectionError('The API base address contains an unsafe path.');
 return base?u.href.replace(/\/$/,''):u.href;
}
export async function bindingOf(config){return digest(new TextEncoder().encode(JSON.stringify([config.baseUrl,config.authHeader.toLowerCase(),config.authPrefix])));}
function envBase(service,env){return service.baseUrlEnv?env[service.baseUrlEnv]:service.baseUrl;}
function builtinConfig(id,service,env){
 const base=envBase(service,env);if(!base)return null;
 return {id,name:service.displayName||id,description:service.description||'Connect this service so your dot can use it when you ask.',baseUrl:base.replace(/\/$/,''),authHeader:service.authHeader,authPrefix:service.authPrefix||'',keyHelpUrl:service.keyHelpUrl||'',keyHelpText:service.keyHelpText||'Ask your dot to find the official instructions for getting a key. Never paste a key into chat.',accessDescription:service.accessDescription||'The bridge can make requests permitted by this key. Your dot must still follow your instructions and approval requirements.',sourceUrl:service.sourceUrl||'',testRequest:service.testRequest||null};
}
export function connectionStore(db){
 if(!db)throw new ConnectionError('Connection storage is unavailable. Try again later.',503);
 return {
  async listMeta(){const r=await db.prepare('SELECT service_id, config_json, binding_hash, state, (key_value IS NOT NULL) AS has_key, last_test_json, revision, updated_at FROM bridge_connections ORDER BY updated_at DESC LIMIT 101').all();if(r.results.length>100)throw new ConnectionError('This bridge has reached its connection limit.',409);return r.results;},
  async get(id,includeKey=false){return db.prepare(includeKey?'SELECT service_id, config_json, binding_hash, state, key_value, last_test_json, revision, updated_at FROM bridge_connections WHERE service_id = ?':'SELECT service_id, config_json, binding_hash, state, (key_value IS NOT NULL) AS has_key, last_test_json, revision, updated_at FROM bridge_connections WHERE service_id = ?').bind(id).first();},
  async prepare(id,config,binding){const r=await db.prepare("INSERT INTO bridge_connections (service_id, config_json, binding_hash, state, revision, updated_at) VALUES (?, ?, ?, 'prepared', ?, ?) ON CONFLICT(service_id) DO UPDATE SET config_json = excluded.config_json, revision = excluded.revision, updated_at = excluded.updated_at WHERE bridge_connections.binding_hash = excluded.binding_hash").bind(id,JSON.stringify(config),binding,crypto.randomUUID(),now()).run();if(r.meta?.changes!==1)throw new ConnectionError('Use a new connection name for a different API destination. Existing keys are never retargeted.',409);},
  async save(id,config,binding,key,lastTest,expectedRevision){const r=await db.prepare("INSERT INTO bridge_connections (service_id, config_json, binding_hash, state, key_value, last_test_json, revision, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?) ON CONFLICT(service_id) DO UPDATE SET key_value = excluded.key_value, state = 'active', last_test_json = excluded.last_test_json, revision = excluded.revision, updated_at = excluded.updated_at WHERE bridge_connections.binding_hash = excluded.binding_hash AND bridge_connections.revision = ?").bind(id,JSON.stringify(config),binding,key,JSON.stringify(lastTest),crypto.randomUUID(),now(),expectedRevision).run();if(r.meta?.changes!==1)throw new ConnectionError('Connection details changed. Reload before saving a key.',409);},
  async disable(id,config,binding,expectedRevision){const r=await db.prepare("INSERT INTO bridge_connections (service_id, config_json, binding_hash, state, key_value, revision, updated_at) VALUES (?, ?, ?, 'disabled', NULL, ?, ?) ON CONFLICT(service_id) DO UPDATE SET key_value = NULL, state = 'disabled', last_test_json = NULL, revision = excluded.revision, updated_at = excluded.updated_at WHERE bridge_connections.binding_hash = excluded.binding_hash AND bridge_connections.revision = ?").bind(id,JSON.stringify(config),binding,crypto.randomUUID(),now(),expectedRevision).run();if(r.meta?.changes!==1)throw new ConnectionError('Connection details changed. Reload and try again.',409);},
  async recordTest(id,lastTest,expectedRevision){const r=await db.prepare('UPDATE bridge_connections SET last_test_json = ?, updated_at = ? WHERE service_id = ? AND revision = ?').bind(JSON.stringify(lastTest),now(),id,expectedRevision).run();if(r.meta?.changes!==1)throw new ConnectionError('Connection details changed. Reload before testing again.',409);}
 };
}
function parseRow(row){if(!row)return null;try{return {...row,config:JSON.parse(row.config_json),lastTest:row.last_test_json?JSON.parse(row.last_test_json):null};}catch{throw new ConnectionError('A connection needs repair. Ask your dot to check its saved configuration.',503);}}
function dynamicService(config){return {enabled:true,baseUrl:config.baseUrl,credentialEnv:`BRIDGE_SAVED_${config.id}`,enableEnv:`BRIDGE_ENABLED_${config.id}`,authHeader:config.authHeader,authPrefix:config.authPrefix,blockedRoots:BLOCKED_ROOTS,blockedSegments:['rotate'],rpc:false};}
function savedService(config){
 const builtin=Object.hasOwn(SERVICES,config.id)?SERVICES[config.id]:null;
 if(!builtin)return dynamicService(config);
 if(config.authHeader.toLowerCase()!==builtin.authHeader.toLowerCase()||config.authPrefix!==builtin.authPrefix||(!builtin.baseUrlEnv&&config.baseUrl!==builtin.baseUrl.replace(/\/$/,'')))throw new ConnectionError('The saved destination or authentication differs from this connection.',409);
 safeUrl(config.baseUrl,{base:true});
 return {...builtin,baseUrl:config.baseUrl,baseUrlEnv:undefined};
}
async function getConfig(id,env,store){
 if(typeof id!=='string'||!ID.test(id)||RESERVED.has(id))throw new ConnectionError('That connection was not found.',404);
 const row=parseRow(await store.get(id));const base=Object.hasOwn(SERVICES,id)?builtinConfig(id,SERVICES[id],env):null;const config=row?.config||base;if(!config)throw new ConnectionError('Ask your dot to prepare this connection first.',404);
 const binding=await bindingOf(config);if(row&&row.binding_hash!==binding)throw new ConnectionError('The connection has an invalid destination binding.',409);
 savedService(config);
 return {row,config,binding,proof:`${binding}:${row?.revision||'initial'}`};
}
export async function prepareConnection(args,env,storeOverride){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!META_KEYS.includes(k)))throw new ConnectionError('Only non-secret connection details are accepted.');
 const name=text(args.name,80,true);if(/^(sites_|hub_|sk-)/i.test(name))throw new ConnectionError('That looks like a key. Put a service name here, not a key.');const id=args.id||name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,64);if(typeof id!=='string'||!ID.test(id)||RESERVED.has(id))throw new ConnectionError('Use a short connection name starting with a letter.');
 const authHeader=text(args.authHeader,64,true),authPrefix=args.authPrefix??'';if(!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(authHeader)||FORBIDDEN_HEADERS.has(authHeader.toLowerCase())||/^(proxy-|sec-|x-forwarded-)/i.test(authHeader)||typeof authPrefix!=='string'||!/^([A-Za-z]{1,20} )?$/.test(authPrefix))throw new ConnectionError('The authentication header format is not supported.');
 const config={id,name,baseUrl:safeUrl(text(args.baseUrl,2048,true),{base:true}),authHeader,authPrefix,description:text(args.description,400),accessDescription:text(args.accessDescription,800,true),keyHelpUrl:args.keyHelpUrl?safeUrl(text(args.keyHelpUrl,2048)):'' ,keyHelpText:text(args.keyHelpText,600),sourceUrl:args.sourceUrl?safeUrl(text(args.sourceUrl,2048)):'',testRequest:null};
 if(args.testRequest!==undefined){const t=args.testRequest;if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['method','path'].includes(k))||!['GET','HEAD'].includes(t.method)||typeof t.path!=='string'||!/^\/(?!\/)/.test(t.path)||/[?#\\\x00-\x20]|%2f|%5c|%2e|%25/i.test(t.path))throw new ConnectionError('An automatic connection check must be a simple read-only request.');config.testRequest={method:t.method,path:t.path};}
 const binding=await bindingOf(config),builtin=Object.hasOwn(SERVICES,id)?builtinConfig(id,SERVICES[id],env):null;
 savedService(config);
 const store=storeOverride||connectionStore(env.DB);const rows=await store.listMeta();if(rows.length>=100&&!rows.some(r=>r.service_id===id))throw new ConnectionError('This bridge has reached its connection limit.',409);
 await store.prepare(id,config,binding);return {id,name,prepared:true,setupPath:`/?connect=${encodeURIComponent(id)}`,message:'Connection details are ready. Open the private setup page to review the destination and add your key.'};
}
export async function listConnections(env,storeOverride){
 const store=storeOverride||connectionStore(env.DB),rows=await store.listMeta();const map=new Map(rows.map(r=>[r.service_id,parseRow(r)]));const ids=[...new Set([...Object.keys(SERVICES),...map.keys()])];const connections=[];
 for(const id of ids){const row=map.get(id),service=SERVICES[id],config=row?.config||(service?builtinConfig(id,service,env):null);if(!config)continue;const binding=await bindingOf(config);savedService(config);if(row&&binding!==row.binding_hash)throw new ConnectionError('A connection has invalid settings.',503);
  const hostedBase=service?builtinConfig(id,service,env):null;const hosted=Boolean(service&&hostedBase&&await bindingOf(hostedBase)===binding&&env[service.credentialEnv]&&(!service.enableEnv||env[service.enableEnv]==='true')),saved=Boolean(row?.state==='active'&&row.has_key),disabled=row?.state==='disabled';
  const configured=!disabled&&(saved||hosted);const lastTest=row?.lastTest||null;
  connections.push({...config,binding:`${binding}:${row?.revision||'initial'}`,authLabel:config.authPrefix.trim()?`${config.authPrefix.trim()} key`:`Key in ${config.authHeader}`,status:disabled?'disabled':configured?(lastTest?.ok===false?'needs_attention':'ready'):'needs_key',source:disabled?'none':saved?'saved':hosted?'hosted':'none',lastTest,canSave:true});
 }
 return {connections,storageAvailable:true};
}
export async function resolveConnectionEnv(env,storeOverride){
 if(!env.DB&&!storeOverride)return env;
 const store=storeOverride||connectionStore(env.DB),rows=await store.listMeta();const registry=Object.assign(Object.create(null),SERVICES),resolved={...env};
 for(const metadata of rows){const row=parseRow(metadata),config=row.config,binding=await bindingOf(config);if(binding!==row.binding_hash)throw new ConnectionError('A connection has invalid settings.',503);
  const service=savedService(config);registry[config.id]=service;
  const hosted=Object.hasOwn(SERVICES,config.id)?builtinConfig(config.id,SERVICES[config.id],env):null;
  if(row.state==='disabled'||row.state!=='active'&&(!hosted||await bindingOf(hosted)!==binding)){resolved[service.enableEnv||`BRIDGE_ENABLED_${config.id}`]='false';registry[config.id]={...service,enabled:false};resolved[service.credentialEnv]=undefined;}
  else if(row.state==='active'){const secret=await store.get(config.id,true);if(!secret?.key_value)throw new ConnectionError('A saved connection needs a new key.',503);resolved[service.credentialEnv]=secret.key_value;if(service.enableEnv)resolved[service.enableEnv]='true';}
 }
 resolved.__BRIDGE_SERVICES=registry;return resolved;
}
async function runCheck(config,env,key,fetcher){
 if(!config.testRequest)return {ok:null,status:null,at:now(),message:'Key saved. No automatic check is configured; ask your dot to try a request.'};
 const service=savedService(config);const proposed={...env,[service.credentialEnv]:key,__BRIDGE_SERVICES:{...(env.__BRIDGE_SERVICES||SERVICES),[config.id]:service}};if(service.enableEnv)proposed[service.enableEnv]='true';
 let started=false,received=false;
 const observedFetch=async(...args)=>{started=true;const response=await fetcher(...args);received=true;return response;};
 try{const result=await genericCall('bridge_api_read',{serviceId:config.id,...config.testRequest},proposed,observedFetch);const ok=Boolean(result.ok&&!result.redirectRefused);const code=ok?null:result.redirectRefused?'provider_redirect':[401,403].includes(result.status)?'provider_rejected':'provider_http';return {ok,status:result.status??null,code,at:now(),message:ok?'Connection check passed. Your dot is ready to use this service.':code==='provider_rejected'?'The provider rejected the check. Confirm this key has the required account access.':code==='provider_redirect'?'The provider redirected the check. Your key was not forwarded.':`The provider check returned HTTP ${result.status}. Ask your dot to check the connection details.`};}
 catch{const code=!started?'check_configuration':received?'provider_response':'provider_network';return {ok:false,status:null,code,at:now(),message:code==='check_configuration'?'The bridge could not prepare the provider check. Ask your dot to repair the connection setup.':code==='provider_response'?'The provider responded, but the bridge could not safely process its response. Ask your dot to check the integration.':'The provider check could not complete because of a connection error or timeout. Try later.'};}
}
export async function connectionAction(id,action,args,env,fetcher,storeOverride){
 const store=storeOverride||connectionStore(env.DB);const {config,binding,proof,row}=await getConfig(id,env,store);const allowed=action==='key'?['key','expectedBinding','test']:['expectedBinding'];if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!allowed.includes(k))||args.expectedBinding!==proof)throw new ConnectionError('Connection details changed. Reload before continuing.',409);
 let message;
 if(action==='key'){
  if(typeof args.key!=='string'||args.key.length<1||args.key.length>8192||/[\x00-\x20\x7f]/.test(args.key))throw new ConnectionError('Paste only the key itself, with no spaces or extra lines.',400,'key_format');
  const check=args.test===false?{ok:null,status:null,at:now(),message:'Key saved. Ask your dot to test a request.'}:await runCheck(config,env,args.key,fetcher);
  if(check.ok===false)throw new ConnectionError(check.message+' Nothing was changed.',422,check.code,check.status);
  await store.save(id,config,binding,args.key,check,row?.revision||null);message=check.message;
 }else if(action==='disconnect'){await store.disable(id,config,binding,row?.revision||null);message='Disconnected from this bridge. The key was not revoked at the service.';}
 else if(action==='test'){
  const resolved=await resolveConnectionEnv(env,store),service=(resolved.__BRIDGE_SERVICES||SERVICES)[id];if(!service?.enabled||!resolved[service.credentialEnv])throw new ConnectionError('Add a key before testing this connection.');const check=await runCheck(config,resolved,resolved[service.credentialEnv],fetcher);if(row)await store.recordTest(id,check,row.revision);if(check.ok===false)throw new ConnectionError(check.message,422,check.code,check.status);message=check.message;
 }else throw new ConnectionError('Unknown connection action.',404);
 const status=await listConnections(env,store);return {connection:status.connections.find(c=>c.id===id),message};
}
export async function readUiJson(request){const reader=request.body?.getReader();if(!reader)throw new ConnectionError('A request body is required.');const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new ConnectionError('This request is too large.',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ConnectionError('The request could not be read.');}}
export function requireUiWrite(request){
 if(request.method!=='POST')throw new ConnectionError('This action requires a POST request.',405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-bridge-ui')!=='1'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||['cross-site','none'].includes(request.headers.get('sec-fetch-site')))throw new ConnectionError('Open this action from your private bridge page.',403);
}
