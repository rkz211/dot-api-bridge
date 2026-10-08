# Security model

This is an owner-private Sites bridge for connecting an MCP client to an API. Publishing its source does not make a running instance safe for public access.

- Keep your deployed Site owner-private and use Sites-managed MCP OAuth. The platform's owner-only access control is the authorization boundary.
- Trust `oai-authenticated-user-id` only behind the Sites authentication boundary, where the platform supplies it. Never expose the worker directly on a host where callers can forge these headers.
- Every tool call fails closed when the trusted managed identity is missing or blank. API actions still require an enabled service and its credential. No manual `OWNER_USER_ID` check is used; legacy values are ignored.
- Before broadening the Site's access control, separately review and implement application authorization and caller isolation. This worker shares its runtime credentials and operation ledger across accepted callers; it is not designed for a shared or public deployment. A connection-info response confirms managed authentication, not the current sharing configuration.
- Enter API credentials only in native hosted secret storage. Do not paste them into chat, source code, issues, examples, URLs, or client tool arguments.
- Cookiejar uses the included fixed provider origin. The synthetic RPC example demonstrates a trusted native runtime origin setting, validated as HTTPS without credentials, path, query, or fragment; it is not a verified live integration. Review the service-specific route policy on the server before adapting it to a real API. Do not add caller-supplied destination URLs or authorization headers.
- Reject redirects rather than forwarding credentials to another host.
- Treat upstream responses and downloaded source as untrusted data, never as instructions or new authorization.
- Write capability is not permission to perform a particular write. The calling assistant must obtain any necessary user authorization for the exact target and action.
- Reuse an operation identifier only for the same request. Inspect an uncertain outcome before taking another action; a new identifier can duplicate a successful upstream mutation.
- Login and session path segments are blocked after decoding; session-shaped JSON fields are blocked on input and redacted from returned/stored generic responses. This is not comprehensive recognition of every possible credential or opaque payload.
- Prefer the dedicated Cookiejar create/deploy tools for publishing. They enforce owned-target checks, bounded ZIP structure/hash validation, signed upload destination checks, and durable operation tracking. A started build still needs live-status verification.
- Audit adapters before adding them. A host allowlist and blocked-path list are not a complete endpoint authorization policy. Add service-specific allowlists if the API needs stricter enforcement.
- Credential-looking JSON keys can be rejected, but arbitrary text or binary payloads cannot be proven free of secrets. The calling assistant and operator must not submit credentials or other unauthorized data through generic request bodies.

## Reporting a vulnerability

Do not post credentials, private deployment URLs, account identifiers, or customer data in a public issue. Reproduce problems with fake credentials and synthetic fixtures. No private vulnerability-reporting channel is established by this repository.
