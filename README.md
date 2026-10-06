# dot API shim

A small, private MCP bridge for connecting a dot to APIs through server-held credentials. The client chooses an approved service and request; the server fixes the upstream origin, injects the credential, bounds responses, and records write attempts durably.

This is source you deploy into your own private Sites account. It is not a shared public API or an automatically configured integration.

## Start here

- [Installation](SETUP.md): managed OAuth, native hosted secrets, and owner binding
- [Instructions for your dot](agent-handoff.md): a self-contained setup handoff for Cookiejar and Project Tree
- [Security model and limits](SECURITY.md): trust boundary, route policy, opaque payloads, and uncertain writes

The bridge does not call an LLM API or need an LLM API key. Hosting and upstream API costs depend on your providers.

## Design

- A server-owned service registry selects a fixed HTTPS origin and credential environment variable.
- The exact authenticated Sites owner is required for API actions.
- Request previews perform no network call and do not grant authorization.
- Read and write tools are distinct. JSON action APIs must classify actions by behavior, not HTTP verb alone.
- Writes are off until explicitly enabled and require durable storage and a stable operation identifier.
- An uncertain write is not automatically retried. Inspect the upstream state before deciding what to do next.
- The implementation does not expose a credential entry form or arbitrary caller-supplied destination URL.

## Important limits

This is a prototype, not a security certification. A fixed origin and blocked-route list are not a full service-specific permission model. Arbitrary text and binary payloads cannot be proven free of secrets. Review an API's exact contract and the user's permissions before enabling it. Keep the deployed Site private.

The tests use synthetic data, fake credentials, and mocked upstream calls. They do not establish that your live deployment, account access, or write operations work. Configuration examples intentionally contain placeholders and must not be deployed unchanged.

## License

MIT. See [LICENSE](LICENSE).

## Local checks

Requires Node.js 22 or later. No package installation is needed.

```sh
npm test
npm run check
npm run build
```

The build places the worker entry point at `dist/server/index.js`. Provision a D1-compatible `DB` binding and apply `schema.sql` for durable writes. Runtime imports are included beside the entry point.

## Configuration

Edit `services.example.mjs` or replace the re-export in `services.mjs` with your reviewed registry. The checked-in `.invalid` hosts are placeholders. Never replace credential environment-variable names with secret values.

Native runtime settings:

- `OWNER_USER_ID`: exact Sites-managed authenticated owner identifier
- `HUB_KEY`: Cookiejar API secret
- `COOKIEJAR_ENABLED=true`: activate the reviewed Cookiejar service configuration
- `PROJECT_TREE_INGEST_TOKEN`: Project Tree API secret
- `PROJECT_TREE_ENABLED=true`: activate the reviewed Project Tree service configuration
- `WRITES_ENABLED=true`: enable write tools only after approved access expansion and durable storage setup
- `DB`: platform-provisioned durable SQL binding, not a text secret

Cookiejar and Project Tree are both inactive unless their activation flag is set. Writes also require their separate flag. Project Tree supports a reviewed JSON-action allowlist; it does not expose every upstream action. Direct signed uploads currently support Cookiejar's exact source-storage path contract only. Project Tree large-file signed upload completion needs a separately reviewed flow.
