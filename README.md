# dot API bridge

An assistant setup may lack a supported tool or connection for a particular external API. This private hosted MCP bridge adds that connection for a dot or another compatible MCP client, using server-held credentials.

The client chooses an approved service and request; the server fixes the upstream origin, injects the credential, bounds responses, and records write attempts durably.

This is source you deploy into your own owner-private Site. Sites-managed authentication and the Site's owner-only access control authorize callers. It is not a shared public API or an automatically configured integration.

Cookiejar is the included concrete example. It is currently waitlist-stage, so its examples require existing authorized access and a valid credential; this repository does not grant access. A separate synthetic JSON-action API example shows how the generic registry works without depending on another real service.

## Start here

- [Source repository](https://github.com/rkz211/dot-api-bridge): canonical repository and clone URL
- [Installation](SETUP.md): step-by-step setup, owner prompts, and verification gates
- [Instructions for your dot](agent-handoff.md): implementation checklist, Cookiejar publishing sequence, and troubleshooting
- [Security model and limits](SECURITY.md): trust boundary, route policy, opaque payloads, and uncertain writes
- [Small publishing sample](examples/README.md): reproducible source for an authorized live test

The bridge does not call an LLM API or need an LLM API key. Hosting and upstream API costs depend on your providers.

## What is already implemented?

The public source already exposes these MCP tools in [worker.mjs](worker.mjs), [generic.mjs](generic.mjs), and [writes.mjs](writes.mjs):

| Tool | Implemented behavior |
| --- | --- |
| `bridge_connection_info` | Returns Sites-managed authentication status and the authenticated caller ID, never credentials |
| `bridge_services` | Reports service activation and whether a credential is configured |
| `bridge_api_preview` | Validates a request without contacting the API |
| `bridge_api_read` | Fixed-origin GET/HEAD, plus allowlisted read-only JSON actions for configured RPC services |
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

The owner approves the requested access, enters their own upstream credential in native Sites Settings, and completes the plugin's connection/consent flow. The agent verifies Sites-managed authentication with `bridge_connection_info`; no manual owner-ID configuration is needed.

Keep these milestones separate: **code ready → owner-private bridge deployed → secret configured → plugin connected → managed authentication verified → authenticated read verified → write capability approved/configured → specific live action verified**. Publishing the bridge is separate from publishing a website through Cookiejar.

For Cookiejar-only use, leave the synthetic `example_rpc` service disabled. It is an illustration, not a second account to set up.

## Design

- A server-owned service registry selects a fixed HTTPS origin and credential environment variable.
- Every tool call requires a nonblank Sites-managed authenticated identity; the owner-private Site's access control limits who can connect.
- Request previews perform no network call and do not grant authorization.
- Read and write tools are distinct. JSON action APIs must classify actions by behavior, not HTTP verb alone.
- Writes are off until explicitly enabled and require durable storage and a stable operation identifier.
- An uncertain write is not automatically retried. Inspect the upstream state before deciding what to do next.
- The implementation does not expose a credential entry form or arbitrary caller-supplied destination URL.

## Important limits

This is a prototype, not a security certification. A fixed origin and blocked-route list are not a full service-specific permission model. Arbitrary text and binary payloads cannot be proven free of secrets. Review an API's exact contract and the user's permissions before enabling it. Keep the deployed Site owner-private. Broadening its access control requires a separately reviewed application authorization policy before sharing; this worker does not isolate multiple users' credentials or operation records.

The tests use synthetic data, fake credentials, and mocked upstream calls. They do not establish that your live deployment, account access, or write operations work. Cookiejar provider configuration is included. Owner-private Site access, credentials, runtime flags, and the Site-specific hosting manifest still require native setup.

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

The default registry in `services.example.mjs`, re-exported by `services.mjs`, contains the Cookiejar API origin and source-upload host. No Cookiejar adapter editing is required for the included contract. These are provider infrastructure addresses, not credentials. Keep credential environment-variable names in source and enter their values only in native runtime Settings.

Native runtime settings for Cookiejar:

- `HUB_KEY`: Cookiejar API secret
- `COOKIEJAR_ENABLED=true`: activate the reviewed Cookiejar service configuration
- `WRITES_ENABLED=true`: enable write tools only after approved access expansion and durable storage setup
- `DB`: platform-provisioned durable SQL binding, not a text secret

`OWNER_USER_ID` is no longer used. A legacy value can remain without blocking an authenticated connection. Authentication comes from Sites, and authorization relies on the Site remaining owner-private.

Both example services are inactive unless their activation flag is set. Writes also require their separate flag. Direct signed uploads currently support Cookiejar's exact source-storage path contract only. Other upload contracts need a separately reviewed flow.

### Synthetic RPC example

`example_rpc` is a fictional records API with `read_record` / `list_records` read actions and `write_record` / `delete_record` write actions. Its `X-Example-Key` authentication header and action names are illustrative, not a verified provider contract. Tests mock every request to `https://records.example.invalid`; there is no live service at that address.

- `EXAMPLE_RPC_API_URL`: server-configured HTTPS origin with no credentials, path, query, or fragment
- `EXAMPLE_RPC_KEY`: example service credential, entered only in native secret storage
- `EXAMPLE_RPC_ENABLED=true`: activation flag, left unset for normal Cookiejar setup

Do not activate the fictional service as a live integration. To adapt it to a real API, review and update the registry's origin, authentication, action classification, route restrictions, and tests against that API's actual contract; obtain the required access approval before provisioning credentials or enabling it. The generic RPC machinery supports that extension without adding a new tool handler. See [the agent guide](agent-handoff.md#synthetic-rpc-example).

The display name and repository are **dot API bridge** and [rkz211/dot-api-bridge](https://github.com/rkz211/dot-api-bridge). Package, tool, and sample verification identifiers retain their existing names for compatibility.
