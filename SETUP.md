# Set up a private bridge

Give your dot the [build instructions](agent-handoff.md) and tell it the service or task you want to connect. The agent handles implementation and deployment. You review the access, connect the Site's plugin, and enter API keys directly in the masked field on your private bridge page.

Saved connections contain the API destination, authentication format, and key. They require no environment-variable settings. Native `DB` provisioning and Sites-managed authentication are still required. There is no manual owner-ID gate or global write switch.

Cookiejar is the included real example and is currently waitlist-stage. Its live setup assumes existing authorized API access. If access is unavailable, the agent should say so and continue useful source checks or preparation. The optional `example_rpc` service is fictional; leave it inactive unless developing a separately reviewed adapter.

## First deployment for a new owner

The agent should read its current Sites building, hosting, and MCP instructions and use the supported native tools. This is a source template, not a verified one-click directory installer. Create a new private Site only when the owner does not already have a bridge for this task.

1. **Get the source.** Use [rkz211/dot-api-bridge](https://github.com/rkz211/dot-api-bridge), then read [SECURITY.md](SECURITY.md) and [agent-handoff.md](agent-handoff.md).

   ```sh
   git clone https://github.com/rkz211/dot-api-bridge.git
   cd dot-api-bridge
   ```

2. **Create an owner-private Site.** Register it through the native Sites workflow with the MCP capability. The server supplies the setup page at `/` and stateless HTTP MCP at `POST /mcp`. Use [hosting.example.json](hosting.example.json) as a logical configuration example and create `.openai/hosting.json` with the project identity returned for this owner. Do not copy another deployment's manifest or identifiers. Keep the platform's owner-only access policy and managed authentication enabled.

3. **Provision native storage.** Add a native D1 database binding named `DB` through the supported Sites workflow and declare the logical binding in the hosting manifest. A text setting called `DB` is not a database. Include [db/schema.ts](db/schema.ts) and the committed [drizzle/](drizzle/) migration history in the deployment source. Both `bridge_operations` and `bridge_connections` are required. Apply the ordered migrations through the normal Sites workflow before the new Worker serves requests. [schema.sql](schema.sql) is an alternative fresh-database schema for a supported manual provisioning path; do not apply it and then replay the same table-creation migrations. Use the migration-managed path for normal Sites deployment.

4. **Build and check the source.** Use Node.js 22.13+ for the SQLite-backed tests; Node.js 24 is recommended. Run `npm test`, `npm run check`, and `npm run build`. Check the local setup UI with synthetic data and fake keys. The build produces `dist/server/index.js` plus its runtime modules. Package that output and the migration inputs using the current Sites workflow. Never enter a real key merely to test the UI.

5. **Deploy privately.** Save and deploy to the owner-private Site, wait for a successful deployment result, and retain the returned Site/version details privately. Confirm migration success and owner-only access. Missing storage must be repaired before key entry; do not work around it by exposing a public Worker or adding a custom credential service.

6. **Connect the Site's own plugin.** Use the App/private plugin provisioned for this Site. When the current Sites tool exposes `get_site`, request `include_mcp_connection: true` and use the returned plugin ID with the native install/connect flow. Never guess an ID or create a second App. The owner completes the managed sign-in and permissions prompts. Installation alone is not a verified connection.

7. **Verify managed authentication.** Call `bridge_connection_info({})` through the connected plugin. Require `authenticated: true` and `authentication: "sites-managed"`; keep the returned caller ID private. Verify owner-only Site access separately. Call `bridge_connection_status({})` to check storage and setup readiness. Confirm unsigned data-bearing requests fail; the public health response is not an authentication test.

This deploys the bridge itself. It does not prove upstream account access or authorize publishing through a connected API. No external LLM API or LLM API key is required. Hosting and connected-service charges depend on the providers.

## Connect a service in the private page

1. Open the verified private Site link while signed in.
2. Choose a prepared service, or enter a service name, website, or agent-instructions link. Enter your goal when asking your dot for help. Do not enter a key in the search box.
3. If the service is not prepared, copy the page's request to your dot. The agent reads official documentation and uses `bridge_prepare_connection` to save the non-secret API details. Preparation makes no provider request and does not grant access.
4. Follow the returned private setup link. Review the service, access description, key-help instructions, and exact API destination.
5. Enter the key yourself in the masked key field. Confirm the destination, then choose **Save & test**. Keep the key out of chat, source code, files, URLs, and model tool arguments.
6. If a verified GET/HEAD probe is configured, inspect its result. Without one, the page reports that the key is saved but not automatically verified. A failed test leaves an existing working saved key unchanged. If a request's outcome is uncertain, refresh before trying again.
7. Copy the ready connection's handoff and tell your dot the task you want completed. The agent checks safe readiness and makes an authorized request to verify upstream access.

Keys are stored server-side in the Site's native D1 database, with platform-managed encryption at rest. Authorized database administrators can read stored values. The page does not save keys in browser storage or show them again after saving. This is ordinary protected application storage, not a separate inaccessible vault.

The included Cookiejar setup asks for an account sites key and checks `GET /sites`. A per-site token does not support that account-level check. Explain the scope before entry: the account key can read and update the sites it owns. Do not request an admin token. If narrower site-scoped access is required, prepare and verify that specific flow before key entry. Creating new credentials or expanding persistent access still requires the applicable approval.

## Verify the first request

Use `bridge_connection_status({})` or `bridge_services({})` for safe setup metadata. Key presence is not credential validity. The agent should read the provider's contract, preview the intended request if helpful, then inspect the actual upstream status and body.

For an authorized Cookiejar account connection, pass these arguments to `bridge_api_read`:

```json
{"serviceId":"cookiejar","method":"GET","path":"/sites"}
```

For a separately prepared and authorized site-scoped flow, `/me` with a verified `siteId` may be appropriate instead. Never substitute a Sites project ID for an upstream site ID. A successful MCP envelope or `/health` response is not evidence of an authenticated provider read.

For another prepared service, use its returned connection ID and a verified documented relative path. No business-endpoint mapping is needed. GET/HEAD use `bridge_api_read`; other supported methods use `bridge_api_write` with a stable operation ID and the relevant action approval. See [generic requests](agent-handoff.md#generic-requests).

## Update an existing bridge

Reuse its owner-private Site, project identity, native plugin, database binding, and immutable migration history. Preserve saved connections. Apply only the new migrations required by the update; do not reset a database or reapply an already recorded migration. For an older deployment whose tables were created outside the migration history, inspect the actual schema and reconcile that history through the supported workflow before publishing. Do not blindly replay a `CREATE TABLE` migration against an existing table.

Run the checks against the final source, deploy the approved update to the same private Site, then verify authentication, safe connection status, and authorized reads. Keep private IDs, deployment URLs, configuration, and credentials out of public exports.

Existing hosted-secret connections are an optional compatibility fallback, not a setup requirement. Their keys are not automatically copied to D1. An explicit key save in the page takes precedence for the same destination. Disconnect clears the saved value and disables fallback for that connection; it does not revoke the provider's key. Legacy `OWNER_USER_ID` values are ignored, and no `WRITES_ENABLED` setting is needed.

## Completion report

Report source checks, private deployment/access control, database readiness, plugin connection, managed authentication, key setup, and authenticated provider reads separately. Name exactly what was tested. Any create, upload, deploy, or domain change is a separate live action requiring its own applicable approval and result verification. Local tests and visible tools do not prove a live publish.

The agent should return the verified private setup link and the smallest remaining owner action. Do not hand unfinished authorized implementation back to the owner as a vague instruction to build an adapter.

## Background effects

The clouds hold each of 15 colors for three minutes, then blend for twelve seconds. Refreshing restarts at teal. Mouse movement adds a short fading light to the existing background; faster movement makes it stronger. Controls stay still. Touch devices do not use this effect, and your system's Reduced Motion preference disables it and keeps the cloud color static. No extra settings or permissions are required.
