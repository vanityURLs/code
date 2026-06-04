# 0014. Prefer repository-owned configuration

Date: 2026-06-04

Status: Accepted

## Context

vanityURLs is operated as redirects-as-code. Links, policies, generated pages, runtime headers, Worker configuration,
and operator-owned customizations are easier to audit and reproduce when they live in the repository.

Cloudflare also exposes dashboard controls that can configure headers, generated files, redirects, JavaScript rewriting,
robots.txt, security.txt, and other behavior outside Git. Those controls are useful when a setting cannot be represented
in source, such as encrypted secrets, account-level plan features, certificates, access policies, or emergency edge
mitigations. They become a reproducibility problem when they duplicate behavior that the Worker, `wrangler.toml`,
`defaults/`, `custom/`, or `_headers` can own.

## Decision

Prefer repository-owned configuration whenever the behavior can reasonably live in source.

Use Cloudflare dashboard configuration for:

- encrypted secrets and account-bound identifiers
- TLS certificates, DNS records, Access applications, WAF/rate-limit rules, bot controls, and other edge controls that
  cannot currently be expressed by the vanityURLs repository
- temporary incident response controls that are later documented, removed, or converted into source-backed guidance

Do not configure the Cloudflare dashboard as a second source of truth for behavior already owned by the repository, such
as CSP, HSTS, frame/referrer/permissions headers, robots.txt, security.txt, runtime redirects, static public pages,
generated status pages, or shared JavaScript and CSS.

When a dashboard setting remains necessary, document it in the website guidance and, when useful, in the structured
Cloudflare dashboard capture. When a dashboard setting only mirrors repository behavior, leave it disabled and document
why.

## Consequences

- Deployments remain reproducible from Git plus the documented external secrets and edge controls.
- Operators can review most behavior through normal code review instead of remembering dashboard state.
- Cloudflare dashboard changes are still allowed where the platform is the only reasonable control plane.
- Documentation must call out dashboard settings that intentionally stay disabled because source already owns the
  behavior.
