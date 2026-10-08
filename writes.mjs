import {SERVICES} from './services.mjs';
import {createLedger,digest,validateUploadUrl} from './helpers.mjs';
export {createLedger,digest,validateUploadUrl} from './helpers.mjs';
const IDENT=/^[a-zA-Z0-9_-]{1,100}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_ZIP=512*1024;
const schema=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'};
export const EXTRA_TOOLS=[
 {name:'cookiejar_owned_sites',description:'List sites owned by the saved Cookiejar key. Read-only; returns no credentials.',inputSchema:schema({},[]),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:'cookiejar_operation_status',description:'Read a bridge operation outcome without retrying it.',inputSchema:schema({operationId:{type:'string',format:'uuid'}},['operationId']),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'cookiejar_create_site',description:'Create a named Cookiejar site only when the user requests that site. Same operationId is never executed twice; uncertain outcomes need reconciliation, not a new operationId.',inputSchema:schema({name:{type:'string',minLength:1,maxLength:100},operationId:{type:'string',format:'uuid'}},['name','operationId']),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:'cookiejar_deploy_site',description:'Deploy explicitly requested source to a site owned by the saved key. Accepts a base64 ZIP up to 512 KiB with root package.json; sourceSha256 must match. Starts a live publish. Never retry an uncertain result using a new operationId.',inputSchema:schema({siteId:{type:'string',pattern:IDENT.source},operationId:{type:'string',format:'uuid'},sourceZipBase64:str,sourceSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},kind:{type:'string',enum:['static','server']},outputDir:{type:'string',maxLength:100}},['siteId','operationId','sourceZipBase64','sourceSha256','kind']),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}}
];
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
export function validateZip(base64){
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_ZIP/3)*4||!base64.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw Error('Invalid or oversized ZIP encoding');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));if(bytes.length>MAX_ZIP)throw Error('ZIP too large');const v=new DataView(bytes.buffer);const u16=i=>v.getUint16(i,true),u32=i=>v.getUint32(i,true);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10)||u16(end+10)>1000)throw Error('Unsupported ZIP directory');
 const count=u16(end+10),size=u32(end+12),offset=u32(end+16);if(!count||offset+size!==end)throw Error('Invalid ZIP bounds');
 let cursor=offset,total=0;const names=new Set(),ranges=[];
 for(let n=0;n<count;n++){
  if(cursor+46>end||u32(cursor)!==0x02014b50)throw Error('Invalid ZIP entry');
  const flags=u16(cursor+8),method=u16(cursor+10),compressed=u32(cursor+20),plain=u32(cursor+24),len=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),local=u32(cursor+42),mode=u32(cursor+38)>>>16;
  if(cursor+46+len+extra+comment>end||flags&1||![0,8].includes(method)||[compressed,plain,local].includes(0xffffffff)||![0,0x8000,0x4000].includes(mode&0xf000)||plain>10*1024*1024)throw Error('Unsafe ZIP entry');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(cursor+46,cursor+46+len));
  if(!name||name.startsWith('/')||/[\\\x00-\x1f:]/.test(name)||name.split('/').some(p=>p==='..'||p==='.'||p==='.git'||p==='node_modules'||p==='.dev.vars'||p.startsWith('.env'))||names.has(name))throw Error('Unsafe ZIP path');
  if(local+30>offset||u32(local)!==0x04034b50||u16(local+8)!==method||u16(local+6)!==flags)throw Error('Invalid ZIP local entry');
  const localNameLen=u16(local+26),localExtra=u16(local+28),dataStart=local+30+localNameLen+localExtra;
  if(dataStart+compressed>offset||new TextDecoder().decode(bytes.slice(local+30,local+30+localNameLen))!==name)throw Error('Invalid ZIP local bounds');
  if(ranges.some(([a,b])=>local<b&&dataStart+compressed>a))throw Error('Overlapping ZIP entries');ranges.push([local,dataStart+compressed]);
  names.add(name);total+=plain;if(total>20*1024*1024)throw Error('ZIP expands beyond limit');cursor+=46+len+extra+comment;
 }
 if(cursor!==end||!names.has('package.json'))throw Error('ZIP must have root package.json');return bytes;
}
export async function extraCall(name,args,env,fetcher,readJson,ledgerOverride){
 const service=SERVICES.cookiejar;
 if(name!=='cookiejar_operation_status'&&(!service?.enabled||(service.enableEnv&&env[service.enableEnv]!=='true')||!env[service.credentialEnv]))throw Error('Cookiejar service or credential is not configured');
 const owned=async()=>{const data=await api('GET','/sites');const list=Array.isArray(data)?data:data.sites;if(!Array.isArray(list))throw Error('Owned-site response rejected');return list.map(s=>pick(s,['siteId','name','url','kind','buildId','modifiedAt']));};
 async function api(method,path,siteId,body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);try{const headers=new Headers({[service.authHeader]:service.authPrefix+env[service.credentialEnv],'Accept':'application/json'});if(siteId)headers.set(service.siteHeader,siteId);if(body)headers.set('content-type','application/json');const r=await fetcher(new URL(path,service.baseUrl).href,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:controller.signal});if(!r.ok)throw Error(`Cookiejar HTTP ${r.status}`);if(r.status===204)return {};return await readJson(r);}finally{clearTimeout(timer);}}
 if(name==='cookiejar_owned_sites')return {sites:await owned()};
 if(!UUID.test(args.operationId??''))throw Error('Valid operationId required');
 const ledger=ledgerOverride||(env.DB?createLedger(env.DB):null);if(!ledger)throw Error('Durable operation storage unavailable');
 if(name==='cookiejar_operation_status'){const row=await ledger.get(args.operationId);return row?{operationId:args.operationId,state:row.state,result:row.result?JSON.parse(row.result):null}:{operationId:args.operationId,state:'not_found'};}

 let bytes,body;
 if(name==='cookiejar_create_site'){if(typeof args.name!=='string'||!args.name.trim()||args.name.length>100||/[\x00-\x1f]/.test(args.name))throw Error('Invalid site name');body={name:args.name.trim()};}
 else if(name==='cookiejar_deploy_site'){
  if(!IDENT.test(args.siteId??'')||!['static','server'].includes(args.kind)||!/^[a-f0-9]{64}$/.test(args.sourceSha256??''))throw Error('Invalid deployment arguments');
  if(args.outputDir!==undefined&&(typeof args.outputDir!=='string'||!(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/).test(args.outputDir)||args.outputDir.length>100||args.kind!=='static'))throw Error('Invalid output directory');
  bytes=validateZip(args.sourceZipBase64);if(await digest(bytes)!==args.sourceSha256)throw Error('ZIP hash mismatch');body={kind:args.kind,...(args.outputDir?{outputDir:args.outputDir}:{})};
 }else throw Error('Unknown write tool');
 const fingerprint=await digest(new TextEncoder().encode(JSON.stringify({name,args:{...args,sourceZipBase64:undefined}})));
 const prior=await ledger.get(args.operationId);if(prior){if(prior.fingerprint!==fingerprint)throw Error('operationId was already used for different arguments');return {operationId:args.operationId,state:prior.state,result:prior.result?JSON.parse(prior.result):null,replayed:true};}
 const sites=await owned();if(name==='cookiejar_deploy_site'&&!sites.some(s=>s.siteId===args.siteId))throw Error('Site is not owned by the configured key');
 if(!await ledger.claim(args.operationId,fingerprint))return {operationId:args.operationId,state:'in_progress',replayed:true};
 let phase='creating',known={};
 try{
  if(name==='cookiejar_create_site'){const created=await api('POST','/sites',undefined,body);if(!IDENT.test(created.siteId??''))throw Error('Invalid create response');known={siteId:created.siteId};const rawUrl=created.siteUrl??created.url;if(rawUrl){const u=new URL(rawUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('Invalid returned site URL');known.siteUrl=u.href;}}
  else{
   const created=await api('POST','/deploy',args.siteId,body);if(!IDENT.test(created.deployId??''))throw Error('Invalid deploy response');known={siteId:args.siteId,deployId:created.deployId};await ledger.set(args.operationId,'in_progress',known);
   const upload=validateUploadUrl(created.source?.uploadUrl,args.siteId,created.deployId);phase='uploading';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let uploaded;try{uploaded=await fetcher(upload,{method:'PUT',headers:{'content-type':'application/zip'},body:bytes,redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}if(!uploaded.ok)throw Error('Source upload rejected');
   phase='starting';await api('POST',`/deploy/${created.deployId}/start`,args.siteId);known.status='started';
  }
  await ledger.set(args.operationId,'completed',known);return {operationId:args.operationId,state:'completed',result:known};
 }catch{const failure={...known,phase,notice:'Outcome may be uncertain. Inspect operation and deployment status; do not retry with a new operationId.'};await ledger.set(args.operationId,'needs_reconciliation',failure);return {operationId:args.operationId,state:'needs_reconciliation',result:failure};}
}
