# 0017. Fail closed for lookup Turnstile

Date: 2026-06-05

Status: Accepted

## Context

The public lookup page lets a visitor inspect one exact slug before following it. That is useful for trust and safety,
but it is a visibility surface: repeated scripted lookup requests can guess slugs and reveal destinations without
following redirects.

Short-link redirect paths have different requirements. Published links, QR codes, integrations, and simple HTTP clients
must continue to resolve without an interactive browser challenge. Cloudflare WAF and rate limiting remain the first
line of defense for high-volume redirect guessing.

Protected operational paths already follow a fail-closed model with Cloudflare Access: if required Access configuration
is missing, the Worker returns an error instead of exposing the protected page. Turnstile should use the same access
control posture for lookup resolution.

## Decision

Protect `POST /lookup/resolve` with server-side Cloudflare Turnstile verification.

The browser reads `/lookup/turnstile-config`, renders the Turnstile widget with `V8S_TURNSTILE_SITE_KEY` and the fixed
`lookup` action, and sends the token with the lookup request. The Worker validates the token with Cloudflare Turnstile
`siteverify` using `V8S_TURNSTILE_SECRET_KEY`.

The Worker also accepts `TURNSTILE_SITE` and `TURNSTILE_SECRET` as dashboard-friendly aliases for instance deployments
that create both values from the Cloudflare Variables and Secrets screen.

Accept only verification responses that match the current request host and the `lookup` action. Turnstile tokens are
opaque, one-time values; the Worker does not compute a local hash. Cloudflare performs the cryptographic validation
behind `siteverify`, and the Worker verifies the returned decision and binding metadata.

Fail closed:

- if `V8S_TURNSTILE_SECRET_KEY` is missing, `POST /lookup/resolve` returns `503`
- if the request is missing a token, has an oversized token, fails `siteverify`, or returns mismatched hostname/action
  metadata, `POST /lookup/resolve` returns `403`
- if `siteverify` is unavailable or returns a non-JSON response, `POST /lookup/resolve` returns `503`
- malformed or oversized lookup JSON is rejected before calling Turnstile

Do not protect `/{slug}` redirect paths with Turnstile. Do not add zone-wide challenge rules for ordinary redirects.
Keep WAF and rate limiting in front of both redirect guessing and lookup resolution.

## Consequences

- Lookup target resolution is unavailable until operators configure the Turnstile secret, matching the Access
  fail-closed pattern for private operational pages.
- Redirects remain automation-safe and do not depend on browser interactivity.
- Turnstile secrets stay outside Git as Worker runtime configuration.
- Tests must cover fail-closed configuration, missing and invalid tokens, `siteverify` failure modes, mismatched
  hostname/action metadata, malformed lookup request bodies, and the fact that redirects still work without Turnstile
  configuration.
