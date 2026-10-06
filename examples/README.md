# Reproducible publishing sample

`static-site/` is a dependency-free, harmless site for an explicitly approved live test. It contains no account identifiers, credentials, forms, external scripts, or trackers.

Verify locally:

```sh
cd examples/static-site
npm ci
npm run build
```

Zip only `package.json`, `package-lock.json`, `build.mjs`, and `index.html` with those files at the ZIP root. Do not include the bridge itself, generated output, secrets, or dependencies. Compute the exact ZIP's SHA-256 and base64, then use `cookiejar_deploy_site` with the verified target site ID, a new lowercase UUID, `kind: "static"`, and `outputDir: "dist"`.

Follow the [agent publishing guide](../agent-handoff.md#preferred-dedicated-publishing-flow) for approvals, operation recovery, status polling, and final verification. A successful test must reach provider status `live` and serve the exact text `dot-api-shim-static-v1` at the returned URL. Keep or remove the test site only as authorized by its owner.
