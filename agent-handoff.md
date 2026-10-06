# Install this private API bridge for your owner

This is setup guidance, not authorization to change accounts or perform API writes. Ask your owner before installing, publishing a private deployment, adding persistent access, or expanding write capabilities. Never request an API key in chat.

## Goal

Create a new, owner-private MCP Site from this repository so the owner's dot can reach approved API operations. Use the owner's own Site, managed OAuth connection, server-side credentials, and exact authenticated owner binding. Do not use the author's deployment, credentials, or account identifiers.

Read README.md, SETUP.md, and SECURITY.md before deployment. Inspect the source and run its tests. Review the service registry against current official API contracts. Do not enable an unverified integration merely because an example exists.

## Cookiejar

Read the public contract at https://cookiejar.lol/contract/README.md and verify the current API origin, authentication header, and required site-scoping header. Configure only that fixed origin in the server-owned service registry. The owner enters their own Cookiejar credential in native Sites Settings. Never copy credentials from another deployment.

Start with a harmless, owner-authorized metadata read. Source download URLs may expose private code; treat them as sensitive outputs. Creating or deploying a site requires a separate user request specifying the target and action. Upload destinations must be validated against the provider's contract and must never receive the API credential.

## Project Tree

Obtain the owner's correct Project Tree API contract and endpoint. A URL in an example is not proof that it belongs to this owner or that access is authorized. Keep the integration disabled until these are verified.

The reviewed API uses HTTPS JSON action RPC: POST to `/` with an `x-ingest-token` header. The owner retrieves their key through Project Tree's Help → Get my key UI and personally enters it into native hosted secret storage, such as `PROJECT_TREE_INGEST_TOKEN`. The reviewed credential is shared and permits broad workspace access, so explain this before requesting approval to configure it.

HTTP POST alone does not identify a mutation. Core read actions are `help`, `tree`, `read`, `search`, `by`, `view`, `list`, `get`, and `history`. `mailread` changes read state. A correct adapter must enforce an action allowlist and classify actions by their actual effects. Do not expose `issue`, `mapkey`, `voice`, `speak`, or arbitrary unreviewed actions.

For updates, resolve the exact node first, read its current content, and distinguish append from replacement. The reviewed `write` action has no optimistic concurrency precondition. Inspect responses and uncertain outcomes before retrying. Avoid bulk edits until the owner approves scope and the adapter is verified.

## Native setup and checks

1. Create your own private MCP-enabled Site with managed OAuth, using current Sites deployment instructions.
2. In https://chatgpt.com/sites open the Site's More actions → Settings and let the owner enter credentials in the native secret fields.
3. Connect the Site plugin and complete its permissions flow.
4. Read the platform-authenticated caller identity, bind it as the exact owner, and redeploy configuration as required. Never trust a caller-supplied owner field.
5. Test read-only operations. Keep writes disabled until approved and durable operation storage is configured.
6. Report what was actually verified: local mocked tests, live reads, and any explicitly authorized live writes separately.

No LLM API key is required by the bridge. Provider hosting and API charges may still apply. Never describe a mock test as a successful live API operation.
