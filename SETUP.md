# Private Sites deployment

## Before deploying

This repository contains reusable source, not a configured account. Supply your own deployment configuration, managed OAuth setup, owner binding, and native secrets. Do not copy another person's Sites manifest or identifiers.

Use the current official [Sites documentation](https://learn.chatgpt.com/docs/sites) for deployment tooling and manifests. Hosting configuration is deliberately excluded because it is specific to each Site.

## Authentication and secrets

1. Deploy the worker as a private MCP-enabled Site with Sites-managed OAuth.
2. Open [Sites](https://chatgpt.com/sites), find your Site, then open More actions → Settings.
3. Enter the API credential through the native hosted secret field. Never enter it in a custom page supplied by this bridge or in chat.
4. Connect the Site's plugin from the Sites UI and complete the platform's permissions flow.
5. Use the bridge's non-secret connection information to obtain the Sites-authenticated caller identifier. Configure that exact identifier as the owner, through the supported native runtime configuration flow.
6. Redeploy a saved version if required for runtime configuration changes to take effect. Verify a read-only operation before enabling any write capability.

The owner identifier is supplied by the platform's trusted authentication boundary. It must not be guessed from an email address or accepted as a tool argument. Credential provisioning, owner binding, and any persistent-access expansion require the account owner's approval.

For writes, configure durable storage and apply the included schema before enabling write tools. Keep write capabilities off until the desired scope is approved. Only issue a live mutation after separately authorizing its exact target and action.

## Verification limits

The automated suite uses mock credentials and mock upstream requests. Passing it does not verify your live API contract, permissions, billing, account state, or successful real-world mutations. Verify read-only behavior first. Write tests do not authorize live writes.

The bridge itself does not call an LLM API and does not require an LLM API key. Hosting and upstream service costs depend on the providers and your account.
