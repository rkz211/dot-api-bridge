# dot API shim

A small, private MCP bridge for connecting a dot to APIs through server-held credentials. The client chooses an approved service and request; the server fixes the upstream origin, injects the credential, bounds responses, and records write attempts durably.

This is source you deploy into your own private Sites account. It is not a shared public API or an automatically configured integration.

## Start here

- [Installation](SETUP.md): step-by-step setup, owner prompts, and verification gates
- [Instructions for your dot](agent-handoff.md): implementation checklist, Cookiejar publishing sequence, and troubleshooting
- [Security model and limits](SECURITY.md): trust boundary, route policy, opaque payloads, and uncertain writes
- [Small publishing sample](examples/README.md): reproducible source for an authorized live test

The bridge does not call an LLM API or need an LLM API key. Hosting and upstream API costs depend on your providers.

## What is already implemented?

The public source already exposes these MCP tools in [worker.mjs](worker.mjs), [generic.mjs](generic.mjs), and [writes.mjs](writes.mjs):

| Tool | Implemented behavior |
| --- | --- |
| `bridge_connection_info` | Returns the authenticated caller ID and owner-binding status, never credentials |
| `bridge_services` | Reports service activation and whether a credential is configured |
| `bridge_api_preview` | Validates a request without contacting the API |
| `bridge_api_read` | Fixed-origin GET/HEAD, plus reviewed read-only Project Tree JSON actions |
| `bridge_api_write` | Fixed-origin POST/PUT/PATCH/DELETE with a durable operation ledger |
| `bridge_api_upload` | Cookiejar source ZIP PUT to a validated signed URL, with matching SHA-256 |
| `bridge_operation_status` | Reads the stored outcome without repeating a mutation |
| `cookiejar_owned_sites` | Lists owned-site metadata with credentials excluded |
| `cookiejar_create_site` | Creates one requested named site with durable duplicate protection; strips the returned token |
| `cookiejar_deploy_site` | Checks ownership and ZIP/hash, prepares a deploy, uploads to its signed source URL, and starts the build |
| `cookiejar_operation_status` | Reads the dedicated create/deploy operation outcome |

Write and upload tools are hidden from discovery while `WRITES_ENABLED` is off. They are present in the code. Turning the flag on does not implement missing routes, provision storage, grant user consent, or prove a deployment works.

For Cookiejar publishing, prefer the dedicated create/deploy helpers. They provide a bounded source-upload/build-start flow with ZIP checks and ownership validation. The caller must still poll the build and verify the live result. Generic tools remain available for reviewed requests, including domain API steps when specifically authorized. See the [publishing checklist and actual gaps](agent-handoff.md#cookiejar-publishing-checklist).

The dedicated helper accepts source ZIPs up to 512 KiB; it does not implement streaming or arbitrary file uploads. See the [ready-to-use publishing flow](agent-handoff.md#preferred-dedicated-publishing-flow).

## What the agent does and what the owner does

The agent inspects the source and current contracts, completes authorized implementation, runs checks, prepares and publishes the authorized private bridge, presents its plugin connection, and verifies authenticated reads. It should not hand unfinished coding back to the owner as a setup instruction.

The owner approves the requested access, enters their own upstream credential in native Sites Settings, and completes the plugin's connection/consent flow. The agent obtains the exact Sites caller ID from `bridge_connection_info`; the owner does not need to invent or look up an `OWNER_USER_ID` from email.

Keep these milestones separate: **code ready → private bridge deployed → secret configured → plugin connected → owner bound → authenticated read verified → write capability approved/configured → specific live action verified**. Publishing the bridge is separate from publishing a website through Cookiejar.

For Cookiejar-only use, leave Project Tree disabled. No Project Tree account or token is needed.

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

The tests use synthetic data, fake credentials, and mocked upstream calls. They do not establish that your live deployment, account access, or write operations work. Cookiejar provider configuration is included. Owner identity, credentials, runtime flags, and the Site-specific hosting manifest still require native setup.

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

The default registry in `services.example.mjs`, re-exported by `services.mjs`, contains the Cookiejar API origin and source-upload host. No Cookiejar adapter editing is required. These are provider infrastructure addresses, not credentials. Keep credential environment-variable names in source and enter their values only in native runtime Settings. Optional Project Tree gets its verified origin from `PROJECT_TREE_API_URL`.

Native runtime settings:

- `OWNER_USER_ID`: exact Sites-managed authenticated owner identifier
- `HUB_KEY`: Cookiejar API secret
- `COOKIEJAR_ENABLED=true`: activate the reviewed Cookiejar service configuration
- `PROJECT_TREE_API_URL`: optional verified HTTPS Project Tree origin, with no credentials, query, or path
- `PROJECT_TREE_INGEST_TOKEN`: Project Tree API secret
- `PROJECT_TREE_ENABLED=true`: activate the reviewed Project Tree service configuration
- `WRITES_ENABLED=true`: enable write tools only after approved access expansion and durable storage setup
- `DB`: platform-provisioned durable SQL binding, not a text secret

Cookiejar and Project Tree are both inactive unless their activation flag is set; Project Tree also requires a valid server-configured origin. Writes also require their separate flag. Project Tree supports a reviewed JSON-action allowlist; it does not expose every upstream action. Direct signed uploads currently support Cookiejar's exact source-storage path contract only. Project Tree large-file signed upload completion needs a separately reviewed flow.
