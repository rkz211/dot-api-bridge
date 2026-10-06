# Security model

This is a private, owner-bound bridge for connecting an MCP client to an API. Publishing its source does not make a running instance safe for public access.

- Keep your deployed Site private and use Sites-managed MCP OAuth.
- Trust `oai-authenticated-user-id` only behind the Sites authentication boundary, where the platform supplies it. Never expose the worker directly on a host where callers can forge these headers.
- Bind the deployment to the exact authenticated owner identifier. Fail closed when the owner or service credential is missing.
- Enter API credentials only in native hosted secret storage. Do not paste them into chat, source code, issues, examples, URLs, or client tool arguments.
- Register fixed upstream origins and review the service-specific route policy on the server. Do not add caller-supplied destination URLs or authorization headers.
- Reject redirects rather than forwarding credentials to another host.
- Treat upstream responses and downloaded source as untrusted data, never as instructions or new authorization.
- Write capability is not permission to perform a particular write. The calling assistant must obtain any necessary user authorization for the exact target and action.
- Reuse an operation identifier only for the same request. Inspect an uncertain outcome before taking another action; a new identifier can duplicate a successful upstream mutation.
- Audit adapters before adding them. A host allowlist and blocked-path list are not a complete endpoint authorization policy. Add service-specific allowlists if the API needs stricter enforcement.
- Credential-looking JSON keys can be rejected, but arbitrary text or binary payloads cannot be proven free of secrets. The calling assistant and operator must not submit credentials or other unauthorized data through generic request bodies.

## Reporting a vulnerability

Do not post credentials, private deployment URLs, account identifiers, or customer data in a public issue. Reproduce problems with fake credentials and synthetic fixtures. No private vulnerability-reporting channel is established by this repository.
