import {SERVICES} from './services.mjs';
export const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function validateUploadUrl(value,siteId,deployId){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!==SERVICES.cookiejar.uploadHost||u.port||u.username||u.password||u.hash||u.pathname!==`/${siteId}/deploys/${deployId}/source.zip`||!u.searchParams.has('X-Amz-Signature')||u.searchParams.get('X-Amz-Algorithm')!=='AWS4-HMAC-SHA256')throw Error('Upload destination rejected');return u.href;
}
export function createLedger(db){
 return {
  async get(id){return db.prepare('SELECT fingerprint, state, result FROM bridge_operations WHERE operation_id = ?').bind(id).first();},
  async claim(id,fingerprint){const r=await db.prepare('INSERT OR IGNORE INTO bridge_operations (operation_id, fingerprint, state, created_at) VALUES (?, ?, ?, ?)').bind(id,fingerprint,'in_progress',new Date().toISOString()).run();return r.meta?.changes===1;},
  async set(id,state,result){await db.prepare('UPDATE bridge_operations SET state = ?, result = ? WHERE operation_id = ?').bind(state,JSON.stringify(result),id).run();}
 };
}
