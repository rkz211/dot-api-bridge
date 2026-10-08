import {renderUi} from './ui.mjs';
import {CONNECTION_TOOLS,ConnectionError,listConnections,prepareConnection,connectionAction,resolveConnectionEnv,requireUiWrite,readUiJson} from './connections.mjs';
import {GENERIC_TOOLS, genericCall, clean} from './generic.mjs';
import {EXTRA_TOOLS, extraCall} from './writes.mjs';
import {SERVICES} from './services.mjs';
const MAX_REQUEST = 1024 * 1024;
const CONNECTION = {
  name: 'bridge_connection_info',
  description: 'Read Sites-managed authentication status and the authenticated caller ID. Never returns credentials.',
  inputSchema: {type: 'object', properties: {}, required: [], additionalProperties: false},
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}
};
const TOOLS = [CONNECTION, ...CONNECTION_TOOLS, ...GENERIC_TOOLS, ...EXTRA_TOOLS];
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}
});
const error = (id, code, message, status = 200) => json({jsonrpc: '2.0', id, error: {code, message}}, status);
const result = (id, value) => json({jsonrpc: '2.0', id, result: value});
async function readRequest(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Empty request');
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_REQUEST) {await reader.cancel(); throw Error('Request too large');}
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const value of chunks) {bytes.set(value, offset); offset += value.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(fetcher = (...args) => globalThis.fetch(...args)) {
  return async (request, env = {}) => {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') return json({service: 'dot-api-bridge', ok: true});
    if(path==='/'||path.startsWith('/api/connections')){
      if(!request.headers.get('oai-authenticated-user-id')?.trim())return json({error:'authentication_required',message:'Sign in to open your private bridge.'},403);
      if(path==='/'&&request.method==='GET'){
        const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
        return new Response(renderUi({nonce}),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
      }
      try{
        if(path==='/api/connections'&&request.method==='GET')return json(await listConnections(env));
        requireUiWrite(request);const args=await readUiJson(request);
        if(path==='/api/connections/prepare'){const prepared=await prepareConnection(args,env);const status=await listConnections(env);return json({connection:status.connections.find(c=>c.id===prepared.id),message:prepared.message},201);}
        const match=/^\/api\/connections\/([a-z][a-z0-9_-]{1,63})\/(key|test|disconnect)$/.exec(path);if(!match)return json({error:'not_found',message:'That connection action was not found.'},404);
        return json(await connectionAction(match[1],match[2],args,env,fetcher));
      }catch(cause){return json({error:cause instanceof ConnectionError?'connection_error':'storage_unavailable',code:cause instanceof ConnectionError?cause.code:'storage_unavailable',providerStatus:cause instanceof ConnectionError?cause.providerStatus:null,message:cause instanceof ConnectionError?cause.message:'Connection storage is unavailable. No successful change is confirmed. Refresh before trying again.'},cause instanceof ConnectionError?cause.status:503);}
    }
    if (path !== '/mcp') return json({error: 'Not found'}, 404);
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') return json({error: 'JSON required'}, 415);
    if(request.headers.has('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin not allowed'},403);
    let rpc;
    try {rpc = await readRequest(request);} catch {return error(null, -32700, 'Invalid or oversized JSON');}
    const id = rpc?.id ?? null;
    if (!rpc || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return error(id, -32600, 'Invalid request');
    if (rpc.method === 'initialize') return result(id, {protocolVersion: '2024-11-05', capabilities: {tools: {}}, serverInfo: {name: 'dot-api-bridge', version: '0.3.0'}});
    if (rpc.method === 'notifications/initialized') return new Response(null, {status: 202});
    if (rpc.method === 'ping') return result(id, {});
    if (rpc.method === 'tools/list') return result(id, {tools: TOOLS});
    if (rpc.method !== 'tools/call') return error(id, -32601, 'Method not found');
    // Requires an owner-private Site: Sites-managed authentication and its owner-only ACL
    // authorize the caller. Never expose the worker directly or trust caller-supplied headers.
    // Broader sharing requires a separately reviewed application authorization policy.
    const user = request.headers.get('oai-authenticated-user-id')?.trim();
    if (!user) return error(id, -32001, 'Authentication required', 403);
    const name = rpc.params?.name, args = rpc.params?.arguments ?? {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return error(id, -32602, 'Unknown tool');
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !Object.hasOwn(tool.inputSchema.properties, k)) || tool.inputSchema.required.some(k => args[k] === undefined)) return error(id, -32602, 'Invalid arguments');
    if (name === CONNECTION.name) return result(id, {content: [{type: 'text', text: JSON.stringify({authenticated: true, authentication: 'sites-managed', userId: user})}], isError: false});
    if(CONNECTION_TOOLS.some(t=>t.name===name)){try{const data=name==='bridge_prepare_connection'?await prepareConnection(args,env):await listConnections(env);if(data.setupPath)data.setupUrl=new URL(data.setupPath,request.url).href;return result(id,{content:[{type:'text',text:JSON.stringify(data)}],isError:false});}catch(cause){return error(id,-32008,cause instanceof ConnectionError?cause.message:'Connection storage is unavailable. No successful change is confirmed.');}}
    try {
      const activeEnv=await resolveConnectionEnv(env);
      const value = EXTRA_TOOLS.some(t => t.name === name)
        ? await extraCall(name, args, activeEnv, fetcher, readRequest)
        : await genericCall(name, args, activeEnv, fetcher);
      const secrets = [...Object.values(SERVICES).map(s => env[s.credentialEnv]),...Object.values(activeEnv.__BRIDGE_SERVICES||SERVICES).map(s => activeEnv[s.credentialEnv])].filter(Boolean);
      return result(id, {content: [{type: 'text', text: JSON.stringify(clean(value, secrets))}], isError: false});
    } catch {
      // Raw upstream exceptions may contain credentials, signed URLs, or private data.
      return error(id, -32006, 'Request rejected or incomplete. Check configuration, arguments, route policy, and operation status before retrying.');
    }
  };
}
export default {fetch: createHandler()};
