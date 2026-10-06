import {GENERIC_TOOLS, genericCall, clean} from './generic.mjs';
import {EXTRA_TOOLS, extraCall} from './writes.mjs';
import {SERVICES} from './services.mjs';
const MAX_REQUEST = 1024 * 1024;
const CONNECTION = {
  name: 'bridge_connection_info',
  description: 'Read the managed authenticated caller ID and owner-binding status. Never returns credentials.',
  inputSchema: {type: 'object', properties: {}, required: [], additionalProperties: false},
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}
};
const TOOLS = [CONNECTION, ...GENERIC_TOOLS, ...EXTRA_TOOLS];
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
    if (path === '/health' && request.method === 'GET') return json({service: 'dot-api-shim', ok: true});
    if (path !== '/mcp') return json({error: 'Not found'}, 404);
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({error: 'JSON required'}, 415);
    let rpc;
    try {rpc = await readRequest(request);} catch {return error(null, -32700, 'Invalid or oversized JSON');}
    const id = rpc?.id ?? null;
    if (!rpc || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return error(id, -32600, 'Invalid request');
    if (rpc.method === 'initialize') return result(id, {protocolVersion: '2024-11-05', capabilities: {tools: {}}, serverInfo: {name: 'dot-api-shim', version: '0.2.0'}});
    if (rpc.method === 'notifications/initialized') return new Response(null, {status: 202});
    if (rpc.method === 'ping') return result(id, {});
    if (rpc.method === 'tools/list') return result(id, {tools: TOOLS.filter(t => t.annotations.readOnlyHint || env.WRITES_ENABLED === 'true')});
    if (rpc.method !== 'tools/call') return error(id, -32601, 'Method not found');
    // Trust this header ONLY behind Sites-managed authentication. Do not expose the worker directly.
    const user = request.headers.get('oai-authenticated-user-id');
    if (!user) return error(id, -32001, 'Authentication required', 403);
    const name = rpc.params?.name, args = rpc.params?.arguments ?? {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return error(id, -32602, 'Unknown tool');
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !Object.hasOwn(tool.inputSchema.properties, k)) || tool.inputSchema.required.some(k => args[k] === undefined)) return error(id, -32602, 'Invalid arguments');
    if (name === CONNECTION.name) return result(id, {content: [{type: 'text', text: JSON.stringify({userId: user, ownerConfigured: Boolean(env.OWNER_USER_ID), callerMatchesOwner: Boolean(env.OWNER_USER_ID && user === env.OWNER_USER_ID)})}], isError: false});
    if (!env.OWNER_USER_ID || user !== env.OWNER_USER_ID) return error(id, -32001, 'Owner authentication required', 403);
    if (!tool.annotations.readOnlyHint && env.WRITES_ENABLED !== 'true') return error(id, -32002, 'Writes are disabled');
    try {
      const value = EXTRA_TOOLS.some(t => t.name === name)
        ? await extraCall(name, args, env, fetcher, readRequest)
        : await genericCall(name, args, env, fetcher);
      const secrets = Object.values(SERVICES).map(s => env[s.credentialEnv]).filter(Boolean);
      return result(id, {content: [{type: 'text', text: JSON.stringify(clean(value, secrets))}], isError: false});
    } catch {
      // Raw upstream exceptions may contain credentials, signed URLs, or private data.
      return error(id, -32006, 'Request rejected or incomplete. Check configuration, arguments, route policy, and operation status before retrying.');
    }
  };
}
export default {fetch: createHandler()};
