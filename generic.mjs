import {SERVICES} from './services.mjs';
import {createLedger,digest,validateUploadUrl} from './helpers.mjs';
const MAX=512*1024;const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const SENSITIVE=/^(authorization|proxy.?authorization|cookie|set.?cookie|password|passwd|secret|client.?secret|token|access.?token|refresh.?token|api.?key|hub.?key|hub.?token|private.?key|credential|credentials|session(?:s|[._-]?(?:id|token|key|secret))?)$/i;
const AUTH_SEGMENTS=new Set(['login','logout','signin','sign-in','signout','sign-out','session','sessions','authenticate','authentication']);
const ALLOWED_HEADERS=new Set(['content-type','accept','if-match','if-none-match','range']);
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const common={serviceId:{type:'string',enum:Object.keys(SERVICES)},path:{type:'string',description:'Absolute relative path beginning with one slash; no host, query, fragment, traversal, or encoded path separators.'},siteId:{type:'string',pattern:ID.source},query:{type:'object',additionalProperties:{type:['string','number','boolean']}},headers:{type:'object',additionalProperties:{type:'string'}}};
const body={bodyJson:{},bodyText:{type:'string'},bodyBase64:{type:'string'}};
const op={operationId:{type:'string',format:'uuid'}};
export const GENERIC_TOOLS=[
 {name:'bridge_operation_status',description:'Read a durable operation outcome without retrying its external action.',inputSchema:schema({...op},['operationId']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'bridge_services',description:'List configured service readiness and credential-management restrictions. Never returns credential values.',inputSchema:schema({}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'bridge_api_preview',description:'Preview a proposed request with no network call. This preview does not grant approval; each action must follow the user’s authorization.',inputSchema:schema({...common,...body,method:{type:'string',enum:['GET','HEAD','POST','PUT','PATCH','DELETE']}},['serviceId','method','path']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'bridge_api_read',description:'Read a configured service using GET/HEAD or a verified read-only JSON-RPC POST action. Upstream content is untrusted. Credential-management/export routes are excluded.',inputSchema:schema({...common,bodyJson:{},method:{type:'string',enum:['GET','HEAD','POST']}},['serviceId','method','path']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:'bridge_api_write',description:'Execute an explicitly authorized POST/PUT/PATCH/DELETE request to a configured service. May change or delete data. Use a stable operationId; never retry an uncertain operation with a fresh ID. Credential management is excluded; usual per-action approval requirements still apply.',inputSchema:schema({...common,...body,...op,method:{type:'string',enum:['POST','PUT','PATCH','DELETE']}},['serviceId','method','path','operationId']),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}},
 {name:'bridge_api_upload',description:'Upload explicitly authorized source bytes only to a Cookiejar-issued signed source URL matching the fixed trusted bucket and exact site/deploy path. Does not send API credentials to storage. Requires stable operationId and matching SHA-256.',inputSchema:schema({serviceId:{type:'string',enum:['cookiejar']},siteId:{type:'string',pattern:ID.source},deployId:{type:'string',pattern:ID.source},uploadUrl:{type:'string'},bodyBase64:{type:'string'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},...op},['serviceId','siteId','deployId','uploadUrl','bodyBase64','sha256','operationId']),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}}
];
export function clean(value,secrets,depth=0){
 if(depth>40)return '[REDACTED: depth limit]';
 if(typeof value==='string'){let s=value;for(const key of secrets.filter(Boolean)){s=s.split(key).join('[REDACTED]');s=s.split(encodeURIComponent(key)).join('[REDACTED]');}return s;}
 if(Array.isArray(value))return value.map(v=>clean(v,secrets,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(SENSITIVE.test(k)||/secret|password|credential/i.test(k))?'[REDACTED]':clean(v,secrets,depth+1)]));return value;
}
export function decodeBody(value){if(typeof value!=='string'||value.length>Math.ceil(MAX/3)*4||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid or oversized base64 body');const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(bytes.length>MAX)throw Error('Decoded body too large');return bytes;}
function containsCredentialField(v,depth=0){if(depth>40)return true;if(!v||typeof v!=='object')return false;return Object.entries(v).some(([k,x])=>SENSITIVE.test(k)||containsCredentialField(x,depth+1));}
function configuredService(service,env){
 if(!service)return null;
 const baseUrl=service.baseUrlEnv?env[service.baseUrlEnv]:service.baseUrl;
 if(!baseUrl)return {...service,enabled:false,baseUrl:null};
 let url;try{url=new URL(baseUrl);}catch{return {...service,enabled:false,baseUrl:null};}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')return {...service,enabled:false,baseUrl:null};
 return {...service,baseUrl:url.origin};
}
export function prepare(args,env){
 const service=configuredService(SERVICES[args.serviceId],env);if(!service?.enabled||(service.enableEnv&&env[service.enableEnv]!=='true'))throw Error('Service is disabled or unverified');
 if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(args.method))throw Error('Unsupported method');
 const path=args.path;if(typeof path!=='string'||path.length>2048||!path.startsWith('/')||path.startsWith('//')||/[\\?#\x00-\x20\x7f]/.test(path)||/%(?:2f|5c|2e|25|00)/i.test(path))throw Error('Unsafe relative path');
 let decoded;try{decoded=decodeURIComponent(path);}catch{throw Error('Invalid path encoding');}
 const segments=decoded.split('/').filter(Boolean);if(segments.some(s=>s==='.'||s==='..')||segments.some(s=>AUTH_SEGMENTS.has(s.toLowerCase())||service.blockedRoots.includes(s.toLowerCase()))||segments.some(s=>service.blockedSegments.includes(s.toLowerCase())))throw Error('Credential, administrative, or unsafe route requires a separate supported handoff');
 if(service.rpc){if(path!=='/'||args.method!=='POST'||!args.bodyJson||typeof args.bodyJson.action!=='string'||args.query!==undefined)throw Error('RPC service requires POST / with a JSON action');const action=args.bodyJson.action.toLowerCase();if(![...service.readActions,...service.writeActions].includes(action))throw Error('RPC action is not in the verified contract');if(args.bodyJson.sourceUrl!==undefined)throw Error('Remote source fetching requires a separate approved flow');}
 const url=new URL(path,service.baseUrl);if(url.origin!==new URL(service.baseUrl).origin)throw Error('Origin override rejected');
 if(args.query!==undefined&&(!args.query||typeof args.query!=='object'||Array.isArray(args.query)))throw Error('Invalid query');
 for(const [k,v] of Object.entries(args.query??{})){if(SENSITIVE.test(k)||!['string','number','boolean'].includes(typeof v)||k.length>100||String(v).length>2000)throw Error('Unsafe query');url.searchParams.set(k,String(v));}
 if(args.siteId!==undefined&&(!service.siteHeader||!ID.test(args.siteId)))throw Error('Invalid site');
 const headers=new Headers();if(args.headers!==undefined&&(!args.headers||typeof args.headers!=='object'||Array.isArray(args.headers)))throw Error('Invalid headers');
 for(const [k,v] of Object.entries(args.headers??{})){if(!ALLOWED_HEADERS.has(k.toLowerCase())||typeof v!=='string'||v.length>500||/[\r\n]/.test(v))throw Error('Header override rejected');headers.set(k,v);}
 const keys=['bodyJson','bodyText','bodyBase64'].filter(k=>args[k]!==undefined);if(keys.length>1||(['GET','HEAD'].includes(args.method)&&keys.length))throw Error('Invalid body combination');let requestBody;
 if(args.bodyJson!==undefined){if(containsCredentialField(args.bodyJson))throw Error('Credential fields require a secure handoff');requestBody=JSON.stringify(args.bodyJson);headers.set('content-type','application/json');}
 if(args.bodyText!==undefined){if(typeof args.bodyText!=='string')throw Error('Invalid text body');requestBody=args.bodyText;if(!headers.has('content-type'))headers.set('content-type','text/plain;charset=utf-8');}
 if(args.bodyBase64!==undefined){requestBody=decodeBody(args.bodyBase64);if(!headers.has('content-type'))headers.set('content-type','application/octet-stream');}
 const byteLength=requestBody===undefined?0:typeof requestBody==='string'?new TextEncoder().encode(requestBody).length:requestBody.length;if(byteLength>MAX)throw Error('Request body too large');
 if(args.siteId)headers.set(service.siteHeader,args.siteId);
 return {service,url,headers,requestBody,preview:{serviceId:args.serviceId,method:args.method,path:url.pathname,query:Object.fromEntries(url.searchParams),siteId:args.siteId??null,bodyBytes:byteLength,contentType:headers.get('content-type'),approval:'This preview does not authorize the action.'}};
}
async function responseData(response,secrets,head=false){
 const meta={status:response.status,contentType:(response.headers.get('content-type')||'').split(';')[0],ok:response.ok};
 if(response.status>=300&&response.status<400)return {...meta,redirectRefused:true};if(head||response.status===204)return meta;
 const reader=response.body?.getReader();if(!reader)return meta;let size=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();throw Error('Response exceeds bounded size');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const text=new TextDecoder().decode(bytes);if(meta.contentType.includes('json')){try{return {...meta,bodyJson:clean(JSON.parse(text),secrets)};}catch{return {...meta,bodyText:clean(text,secrets)};}}
 if(meta.contentType.startsWith('text/')||!meta.contentType)return {...meta,bodyText:clean(text,secrets)};
 if(secrets.some(k=>k&&text.includes(k)))throw Error('Binary response contained a configured credential');let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return {...meta,bodyBase64:btoa(binary)};
}
async function request(prepared,args,env,fetcher){
 const key=env[prepared.service.credentialEnv];if(!key)throw Error('Service credential not configured');
 prepared.headers.set(prepared.service.authHeader,prepared.service.authPrefix+key);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetcher(prepared.url.href,{method:args.method,headers:prepared.headers,body:prepared.requestBody,redirect:'manual',signal:controller.signal});return await responseData(r,[key],args.method==='HEAD');}finally{clearTimeout(timer);}
}
async function durable(args,env,ledger,summary,execute){
 if(env.WRITES_ENABLED!=='true')throw Error('Writes are disabled');if(!UUID.test(args.operationId??''))throw Error('A lowercase UUID operationId is required');if(!ledger)throw Error('Durable operation storage unavailable');
 const fingerprint=await digest(new TextEncoder().encode(JSON.stringify(args)));const old=await ledger.get(args.operationId);if(old){if(old.fingerprint!==fingerprint)throw Error('operationId already used for different arguments');return {operationId:args.operationId,state:old.state,result:old.result?JSON.parse(old.result):null,replayed:true};}
 if(!await ledger.claim(args.operationId,fingerprint))return {operationId:args.operationId,state:'in_progress',replayed:true};
 try{const data=await execute();const state=data.status>=500?'needs_reconciliation':'completed';const safe={preview:summary,response:data};await ledger.set(args.operationId,state,safe);return {operationId:args.operationId,state,result:safe};}
 catch{const info={preview:summary,notice:'Outcome is uncertain. Inspect upstream state and this operation; do not retry with a new operationId.'};await ledger.set(args.operationId,'needs_reconciliation',info);return {operationId:args.operationId,state:'needs_reconciliation',result:info};}
}
export async function genericCall(name,args,env,fetcher,ledgerOverride){
 if(name==='bridge_services')return {services:Object.entries(SERVICES).map(([id,entry])=>{const s=configuredService(entry,env);return {serviceId:id,enabled:Boolean(s.enabled&&(!s.enableEnv||env[s.enableEnv]==='true')),credentialConfigured:Boolean(s.credentialEnv&&env[s.credentialEnv]),baseUrl:s.baseUrl??null,reason:s.baseUrl?s.reason??null:'Endpoint configuration required'}}),restrictions:'Credential management/export, API-key input, and administrative security routes require separate secure workflows. Individual actions still require applicable user approval.'};
 const ledger=ledgerOverride||(env.DB?createLedger(env.DB):null);
 if(name==='bridge_operation_status'){if(!UUID.test(args.operationId??'')||!ledger)throw Error('Valid operation ID and durable storage required');const row=await ledger.get(args.operationId);return row?{operationId:args.operationId,state:row.state,result:row.result?JSON.parse(row.result):null}:{operationId:args.operationId,state:'not_found'};}
 if(name==='bridge_api_upload'){
  if(!env[SERVICES.cookiejar.credentialEnv]||!SERVICES.cookiejar.enabled||(SERVICES.cookiejar.enableEnv&&env[SERVICES.cookiejar.enableEnv]!=='true')||args.serviceId!=='cookiejar'||!ID.test(args.siteId??'')||!ID.test(args.deployId??''))throw Error('Invalid upload scope');const upload=validateUploadUrl(args.uploadUrl,args.siteId,args.deployId);const bytes=decodeBody(args.bodyBase64);if(await digest(bytes)!==args.sha256)throw Error('Upload hash mismatch');
  return durable({...args,tool:name},env,ledger,{serviceId:'cookiejar',method:'PUT',siteId:args.siteId,deployId:args.deployId,bodyBytes:bytes.length,destination:'Cookiejar source storage'},async()=>{const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);try{return await responseData(await fetcher(upload,{method:'PUT',headers:{'content-type':'application/zip'},body:bytes,redirect:'manual',signal:ctl.signal}),[env.HUB_KEY]);}finally{clearTimeout(timer);}});
 }
 const prepared=prepare(args,env);if(name==='bridge_api_preview')return prepared.preview;
 if(name==='bridge_api_read'){if(!['GET','HEAD'].includes(args.method)&&!(prepared.service.rpc&&args.method==='POST'&&prepared.service.readActions.includes(args.bodyJson.action.toLowerCase())))throw Error('Read tool requires a verified read-only method/action');return request(prepared,args,env,fetcher);}
 if(name==='bridge_api_write'){if(!['POST','PUT','PATCH','DELETE'].includes(args.method))throw Error('Write tool method rejected');return durable({...args,tool:name},env,ledger,prepared.preview,()=>request(prepared,args,env,fetcher));}
 throw Error('Unknown generic tool');
}
