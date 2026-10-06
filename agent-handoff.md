# Build and verify this private API bridge

Use this guide with [SETUP.md](SETUP.md). The repository is implementation material, not permission to change an account, enable persistent access, or publish a website. Work within the owner's request and the current platform approval rules.

## Take ownership of implementation

Inspect [worker.mjs](worker.mjs), [generic.mjs](generic.mjs), [helpers.mjs](helpers.mjs), [writes.mjs](writes.mjs), and the service registry before saying a capability is missing. Complete authorized code and configuration work yourself. Ask the owner for consent, native secret entry, connection, or a genuinely missing decision; don't ask them to implement the remaining adapter.

The source contains generic tools plus dedicated Cookiejar owned-site, create-site, deploy-site, and operation-status helpers. Writes are deliberately disabled at runtime by default. Distinguish:

- Missing implementation: the necessary request/response or upload flow is not supported by code.
- Missing configuration: disabled service, absent secret, missing optional endpoint setting, missing database/schema, or an unapplied saved version.
- Missing connection: the Site's plugin is not installed/connected in this conversation.
- Missing owner binding: the authenticated caller does not match `OWNER_USER_ID`.
- Missing authorization: the owner has not approved the access expansion or exact live action.
- Missing verification: the tool exists but the intended live result has not been observed.

“Prepared a private bridge with writes disabled” describes only part of setup. State the next concrete step and who must take it. Don't report “no authenticated publishing connector” until you have checked the deployed source, tool discovery, connection, owner binding, runtime settings, and exact failed call.

## Build checklist

- Use the owner's own private Site and managed OAuth boundary. Add the MCP capability using current Sites tooling; serve stateless HTTP `POST /mcp`. Reuse the Site's provisioned App/plugin on updates.
- Read the current [Cookiejar contract](https://cookiejar.lol/contract/README.md). Verify the fixed API origin, Bearer authentication, `X-Site` scope, and exact source-storage host with current provider configuration. Keep all credential values out of code.
- Review routes by behavior. The current Cookiejar policy blocks configured path segments such as `key`, `admin`, `env`, `auth`, and `rotate`, but is not a complete endpoint allowlist. Never classify an unfamiliar route as harmless solely because it uses GET.
- Ensure the desired flow fits the actual [limits below](#known-limits-and-code-work). Add necessary implementation and synthetic tests within the authorized scope before asking the owner to enable it. If new implementation is outside scope, describe the exact gap and request approval.
- Configure durable `DB` storage with [schema.sql](schema.sql). Keep writes disabled while building and connecting.
- Run the tests, syntax checks, and build. Follow [SETUP.md](SETUP.md) for private deployment, owner secret entry, plugin connection, exact identity binding, and authenticated reads.

## Preferred dedicated publishing flow

After completing [SETUP.md](SETUP.md), use the following tools for an authorized small-source publish:

1. Call `cookiejar_owned_sites({})` to resolve an existing owned site. If the user approved creating a site and the associated credential, call `cookiejar_create_site({"name":"Approved test site","operationId":"REPLACE_WITH_NEW_LOWERCASE_UUID"})`. Record the returned site ID; the token is deliberately excluded.
2. Prepare a valid source ZIP no larger than 512 KiB, with a root `package.json`, needed lockfile/build scripts, and only the approved content. Compute its SHA-256 from the exact bytes. Exclude secrets and dependencies. The helper validates archive structure, unsafe paths, symlinks, duplicate/overlapping entries, compression methods, and declared expansion limits; it does not prove application code is safe.
3. Call `cookiejar_deploy_site` with `siteId`, a different new lowercase UUID `operationId`, `sourceZipBase64`, lowercase `sourceSha256`, and `kind` (`static` or `server`). For static builds, optionally supply the relative `outputDir` required by the current provider contract. For server builds, obtain the credential-creation approval described below.
4. The helper checks ownership, creates the deployment, uploads the ZIP without the API key to the exact validated signed object, and starts the build. It records intermediate deployment identity for reconciliation and never automatically repeats an uncertain mutation. A result with `status: "started"` means build start only.
5. Poll `bridge_api_read({"serviceId":"cookiejar","method":"GET","path":"/deploy/REPLACE_WITH_RETURNED_DEPLOY_ID","siteId":"REPLACE_WITH_VERIFIED_SITE_ID"})` until the provider reaches a terminal status. Verify the correct build is active and inspect its returned live URL/content. Report failure or supersession explicitly.
6. If a call is interrupted, use `cookiejar_operation_status({"operationId":"REPLACE_WITH_ORIGINAL_UUID"})` and read upstream state before taking further action. Preserve operation IDs and do not force a retry with a new one.

These are placeholder examples: replace IDs with verified values, and obtain all required approvals before execution. `cookiejar_deploy_site` is the full prepare/upload/start path for supported ZIPs; an archive larger than the bound needs a separately implemented and reviewed upload flow.

## Cookiejar publishing checklist

The following maps the current provider contract to the lower-level generic tools. Prefer the dedicated flow above for creation and source deployment. Re-read the contract before execution. All mutations need applicable authorization; the examples below are a plan, not permission to run them.

| Stage | Request/tool | Required evidence |
| --- | --- | --- |
| Resolve target | `bridge_api_read`: `GET /sites` or `GET /sites/{siteId}` | Correct owner account and exact site |
| Create, only if requested | `bridge_api_write`: `POST /sites`, JSON `{name}` | Returned site ID; separately approved credential creation because upstream also issues a site token |
| Prepare release | `bridge_api_write`: `POST /deploy`, JSON `{kind, outputDir?}`, with `siteId` | Returned deploy ID and signed source URL |
| Upload source | `bridge_api_upload` | Successful storage response for exact ZIP bytes and SHA-256 |
| Start build | `bridge_api_write`: `POST /deploy/{deployId}/start`, with `siteId` | Accepted build start, not yet a live site; server deployment also requires credential-creation approval |
| Follow build | `bridge_api_read`: `GET /deploy/{deployId}`, with `siteId` | Terminal status; report `failed` or `superseded` honestly |
| Verify publish | Read site/deploy state and check returned live URL | Correct deployment active and intended content accessible |
| Domain, only if requested | Read `GET /edge/domains`; approved `POST /edge/domains` with `{domain}` and `siteId` | DNS, tenant, gateway/certificate, and `live` state verified |

Use `siteId` in tool arguments to set `X-Site`; don't try to override it in `headers`. Do not substitute Sites project IDs for Cookiejar site IDs. The returned site token from creation is redacted by this bridge. Continue using the approved account key and exact site scope; do not weaken redaction to retrieve the token.

### Owner prompts for live actions

Use real verified targets in these prompts. Bundle only what is known, and don't ask again for unchanged approval already given. Required action-time confirmations still apply.

- New site: “Create a Cookiejar site named [name] in your account? Cookiejar also creates a site credential; the bridge will redact it. This does not authorize publishing content yet.”
- Source and deploy: “Upload [identified source/archive] to Cookiejar site [site] and deploy it for [intended audience]? This will publish/replace [content] at [verified destination].” For server deployments, disclose that Cookiejar creates/registers a per-deploy server token and obtain the applicable action-time approval for that persistent access before starting the deployment. Explain sensitive data, costs, or other consequential effects if present.
- Domain: “Attach [exact hostname] to [exact site]? This may change DNS and public routing. I'll inspect the existing assignment first and stop if it points to another site.” Obtain any required confirmation for DNS/security changes; a publish request alone does not authorize moving a domain.

If a hostname is already attached elsewhere, do not remove or move it automatically. Explain the current target and requested change, then seek specific approval. An accepted domain request is not proof of a working certificate or live routing.

### Upload and operation discipline

1. Build the exact source ZIP required by the provider, with the expected project files at its root. Exclude secrets, `.env` values, credential files, dependencies, and unrelated private material. Check size before creating a deployment.
2. Obtain the signed source URL from the authorized prepare-release response. Keep it private. `bridge_api_upload` accepts only Cookiejar, the configured HTTPS host, and `/{siteId}/deploys/{deployId}/source.zip` with the expected signing markers. It sends ZIP bytes without the API credential and refuses redirects.
3. Supply `serviceId`, `siteId`, `deployId`, `uploadUrl`, `bodyBase64`, lowercase `sha256`, and a fresh lowercase UUID `operationId` for that distinct upload. The hash must match the uploaded bytes. Do not paste the URL or bytes into public logs.
4. Every distinct mutation gets its own stable operation ID. Keep the same ID and identical arguments when looking up/replaying that operation. The ledger returns the stored result rather than resending it; changing arguments under that ID is rejected.
5. For timeouts, `needs_reconciliation`, or `in_progress`, inspect `bridge_operation_status` and read upstream state. Never use a fresh ID merely to force a retry. The ledger is not upstream exactly-once delivery, and has no automatic reconciliation workflow.
6. `completed` means the HTTP attempt was recorded. Inspect `result.response.status`, `ok`, and the provider's body: redirects and 4xx can also be recorded as completed. A successful prepare/upload/start response does not establish a live deployment.

## Known limits and code work

These are current implementation limits, not reasons to abandon an authorized task or claim all connectors are unavailable:

- Generic bodies and responses are bounded at 512 KiB; the MCP request envelope has a 1 MiB cap. The signed-source upload is base64-in-JSON, with a 512 KiB decoded limit. Many real projects will not fit even when the provider accepts larger archives. There is no streaming, multipart, or chunked upload implementation. Review and implement a bounded alternative before promising large-project publishing; do not simply raise limits without considering memory and request limits.
- The upload tool supports only source ZIPs. It cannot complete ordinary Cookiejar file-tier signed uploads requiring provider-returned headers, arbitrary signed destinations, or Project Tree large-file uploads. Those need a separately reviewed adapter.
- Source download routes can return private signed URLs. The generic read tool does not become an arbitrary signed-URL download client, and binary responses remain size-limited. A clone/download workflow needs a supported, authorized path of its own.
- Dedicated create/deploy helpers now handle the supported prepare/upload/start sequence. There is no dedicated domain helper, automatic build-completion watcher, or automatic reconciliation. Final status/content checks and any approved domain work remain caller responsibilities.
- The global write flag is broader than publishing. The code does not enforce per-site write grants, a publishing-only route allowlist, domain ownership/assignment policy, or confirmation receipts. Add server-side restrictions when required; never present agent instructions as enforced access controls.
- Login/session paths are now blocked after decoding at every path depth, alongside the configured credential/admin/environment paths. Session-shaped JSON fields are rejected on input and redacted in responses and stored generic results. Regression tests cover these restrictions. This remains a blocklist, not proof every future credential route is covered: use a separate secure workflow for credential management. Broad text/binary bodies are not guaranteed secret-free.
- Local mocks do not test real Sites OAuth, native secret provisioning, the deployed SQL database, live Cookiejar publication, DNS, or TLS. A read-only smoke test establishes only the reads actually tested.

## Troubleshoot the actual failing layer

| Observation | Check and next step |
| --- | --- |
| No bridge tools in this conversation | Check the correct Site's plugin, installation/connection, and current discovery; don't create another Site by default |
| Only read tools appear | Confirm the deployed version and approved `WRITES_ENABLED` value; write/upload tools are filtered from discovery when off |
| `Authentication required` / HTTP 403 | Complete the Site plugin's managed connection; don't forge identity headers |
| `Owner authentication required` / HTTP 403 | Call `bridge_connection_info`, verify intended owner, correct native binding, redeploy |
| `Writes are disabled` | Obtain missing capability approval before changing the flag; verify storage first |
| `Unknown tool` / `Invalid arguments` | Compare exact deployed tool names and schemas, including the required fields |
| `Request rejected or incomplete` / `-32006` | Error is deliberately generic. Check activation, origin, credential presence, arguments, route policy, body limits, `DB`/schema, and operation status without logging secrets |
| Upstream `ok: false` or non-2xx | Diagnose the provider response; a successful MCP envelope is not success |
| Pending deployment/domain | Continue the authorized status checks; report the precise blocker or terminal result |

Report the exact tool, sanitized arguments/target, error code or status, and smallest needed owner action. Don't expose secrets or signed URLs when explaining an error. If current tools or approvals truly block progress, say which step is blocked and continue independent authorized work.

## Optional Project Tree

Project Tree is independent of Cookiejar. Leave `PROJECT_TREE_ENABLED` off unless requested; it requires its own verified endpoint/contract, native `PROJECT_TREE_API_URL` HTTPS origin setting, and native `PROJECT_TREE_INGEST_TOKEN` secret. If the origin is missing or invalid, service readiness reports it disabled.

The example adapter uses POST `/` JSON actions with `x-ingest-token`. Inspect its actual `readActions` and `writeActions` in [services.example.mjs](services.example.mjs); POST alone does not mean mutation. `mailread` changes state and is not enabled. Credential actions such as `issue`/`mapkey`, unreviewed voice actions, and remote `sourceUrl` fetching are not exposed. Explain the credential's scope before enabling access. For edits, resolve and read the target first, distinguish append/replacement, and reconcile uncertain outcomes; do not assume optimistic concurrency support.

## Handoff back to the owner

Give the verified private bridge link, connection action if still needed, checks performed, exact remaining blockers, and next step. Report local tests, authenticated live reads, capability enablement, and specific live writes separately. Never call the bridge fully publishing-ready based only on a flag, tool discovery, or mocked tests.
