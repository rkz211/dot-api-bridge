# Private Sites deployment

Use this private hosted MCP bridge when your assistant setup lacks a supported connection to the API you need. This repository supplies source; each owner still needs their own owner-private deployment, credentials, and Sites-managed plugin connection. No manual owner-ID setting is required. Do not copy another person's deployment manifest, identifiers, or secrets.

Cookiejar provider configuration is included as a concrete example. Cookiejar is currently waitlist-stage; the steps below assume the owner already has authorized API access and the required credential. The bridge does not provide that access. If access is not available, complete local checks or review an authorized alternative API adapter; do not promise a live Cookiejar setup. The optional `example_rpc` configuration is fictional and should stay disabled.

Use the current [Sites documentation](https://learn.chatgpt.com/docs/sites) and the Sites tools available in your environment. Also see [plugin setup](https://learn.chatgpt.com/docs/plugins). UI labels and deployment tooling can change; inspect the current tool schema rather than inventing a command.

## 1. Agree on the requested outcome

Ask only for decisions or approvals that are missing. A documentation request alone does not authorize a running deployment. A request for a read-only bridge does not authorize write access or a live publish.

Suggested owner prompt when scope is missing:

> If you already have Cookiejar API access, should I build and deploy an owner-private bridge for it, initially read-only? I'll prepare the code and configuration; you'll enter your Cookiejar key in Sites Settings and connect its plugin.

For a requested full publishing bridge, finish the authorized implementation while keeping runtime writes off until access approval and checks are complete. Explain any missing functionality precisely; don't leave it as “add publishing later.”

## 2. Prepare the implementation

Use the canonical [dot API bridge repository](https://github.com/rkz211/dot-api-bridge). To get the source locally:

```sh
git clone https://github.com/rkz211/dot-api-bridge.git
cd dot-api-bridge
```

For a dot or another agent working from a link, share the [agent guide](https://github.com/rkz211/dot-api-bridge/blob/main/agent-handoff.md) together with the requested scope.

The agent should:

1. Read [README.md](README.md), [SECURITY.md](SECURITY.md), and [agent-handoff.md](agent-handoff.md), then inspect the source.
2. For an owner with Cookiejar access, use the included registry: its fixed API origin and source-upload host are already configured. Verify provider contract changes before changing them; do not replace the API origin with the portal hostname. Leave the fictional `example_rpc` entry disabled. Adapting it to a real service requires a reviewed contract, server-side policy, synthetic tests, and the owner's approval for the required access.
3. Keep `HUB_KEY` as an environment-variable name in source, never a secret value. Leave optional services inactive.
4. Prepare an owner-private Sites project with the MCP capability and stateless `POST /mcp` endpoint. The repository deliberately omits a site-specific `.openai/hosting.json`; create it through the supported Sites workflow with this owner's returned project ID. Do not copy someone else's manifest.
5. Provision a durable SQL binding named `DB` and apply [schema.sql](schema.sql) before writes. Merely adding a text setting named `DB` does not create a database. Keep `WRITES_ENABLED` unset or `false` initially.
6. Run `npm test`, `npm run check`, and `npm run build` with Node.js 22+. The build writes `dist/server/index.js` and its runtime modules. Package that output using the current Sites workflow; local build success is not deployment success.

Keep runtime values out of the hosting manifest. Use platform-managed authentication and preserve the Site's owner-only access control; never expose this worker directly where callers can forge identity headers. Broadening access requires a separately reviewed application authorization policy before sharing, because credentials and operation records are not isolated by caller.

## 3. Publish the private bridge

Use the owner's existing Site if continuing setup, or the new Site created for this task. Save and deploy through Sites, preserve owner-only access, and verify deployment status reaches success. Retain the returned version/project information privately so configuration changes update the same Site.

This publishes the bridge itself. It does not publish a Cookiejar website, install the plugin, or prove upstream account access.

## 4. Let the owner enter the secret

Provide the verified Site link/name and this instruction:

> Open Sites, find this bridge, then choose More actions → Settings. Add your Cookiejar key as the hosted secret HUB_KEY. Enter it there yourself; don't paste it into chat, a file, source code, or a custom bridge page. Tell me when it's saved without sending the value.

Use [Sites in ChatGPT](https://chatgpt.com/sites). Explain the credential's scope before setup: an account key can reach the sites it owns; a site token has a narrower scope and does not support account-level create/list operations. Use only the credential type needed and approved. Do not ask for an admin token.

Configure `COOKIEJAR_ENABLED=true` only after the registry is reviewed. Redeploy the approved saved version after runtime values change, as required by the [Sites runtime settings instructions](https://learn.chatgpt.com/docs/sites#configure-runtime-environment-values).

## 5. Connect the Site's own plugin

Use the App/private plugin provisioned for this Site, including on updates. Do not build a second App or configure local stdio MCP as a workaround.

When the current Sites connector exposes `get_site`, request `include_mcp_connection: true` and use the returned plugin ID to present the native plugin installation flow. Do not guess an ID. If a connection UI cannot be presented, direct the owner to Plugins → Personal → Created by you, open this Site's plugin, and choose Install or Connect as needed.

Suggested owner prompt:

> Install/connect this bridge's plugin and complete its sign-in and permissions prompts with your own account. I'll then verify the authenticated connection.

Verify the connection with `bridge_connection_info({})`. Installation alone is not a successful authenticated tool call.

## 6. Verify Sites-managed authentication

Call `bridge_connection_info({})` through the connected Site plugin. Require `authenticated: true` and `authentication: "sites-managed"`. Its `userId` comes from the trusted `oai-authenticated-user-id` header supplied by Sites; keep that identifier private.

Verify that the Site still has owner-only access in the native Sites controls. The worker requires a nonblank managed identity on every tool call and relies on that platform access control for authorization. A successful connection-info response proves managed authentication only; it does not independently inspect the Site's sharing settings or prove upstream credential validity.

Do not add or copy an `OWNER_USER_ID` setting. Legacy values are ignored and can remain in place. There is no extra identity-binding step or setting-related redeploy. Missing or blank managed identity still fails with `Authentication required` / HTTP 403.

## 7. Verify authenticated reads

1. Call `bridge_services({})`: the selected service must be enabled and its credential configured. This reports presence, not credential validity.
2. For an approved Cookiejar account key, call `bridge_api_read` with `{"serviceId":"cookiejar","method":"GET","path":"/sites"}`. For a known authorized site, use `{"serviceId":"cookiejar","method":"GET","path":"/me","siteId":"REPLACE_WITH_VERIFIED_SITE_ID"}`.
3. Check the actual upstream status, `ok`, and response content. Neither a successful MCP envelope nor `/health` proves an authenticated upstream read.
4. Report the tested service and operation without exposing private records, source download links, credentials, or owner IDs in public logs.

## 8. Enable only the approved write capability

Before changing persistent access, explain its breadth and obtain the required approval. The current flag enables both generic write and upload tools for enabled services; it is not an endpoint-by-endpoint permission system. Implement narrower server-side policy first if that is the owner's requirement.

Suggested approval prompt:

> May I enable this private bridge's write and source-upload capability for Cookiejar? The current code permits generic API mutations beyond publishing. I'll still require the applicable approval for each live action. If you want publishing-only access enforced by the server, I'll add that restriction before enabling writes.

After approval, verify `DB` and the schema, set `WRITES_ENABLED=true`, redeploy, and refresh tool discovery. The dedicated create/deploy helpers are included in this version; a flag cannot create absent code in an older deployment. Use the [publishing checklist](agent-handoff.md#cookiejar-publishing-checklist) to identify remaining implementation work and obtain approval for a specific live test.

## Completion report

Report each stage independently: source checks; owner-private bridge deployment and access control; secret presence; plugin connection; managed authentication; authenticated upstream reads; write tools exposed; any authorized create, upload, deploy, or domain operation. Mark untested stages as untested. Mock tests never prove a live publish.

No LLM API key is required by this bridge. Provider hosting and API charges may apply.
