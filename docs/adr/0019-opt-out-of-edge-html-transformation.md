# 0019. Opt out of edge HTML transformation

Date: 2026-06-15

Status: Accepted

## Context

vanityURLs ships strict Content Security Policy headers for product HTML. The default CSP blocks inline scripts and
styles so the generated redirector pages remain deterministic and easy to audit.

Some Cloudflare dashboard features can rewrite or inject content into HTML responses after the Worker or static asset
policy has produced the page. JavaScript Detections, Bot Fight Mode, Managed Challenge, Zaraz, Rocket Loader, Snippets,
and similar features can add scripts or rewrite markup at the edge. That creates a mismatch between repository-owned
HTML/CSP and the final response observed by browsers. In strict-CSP instances, the result is often a browser console
error for an injected inline script.

Cloudflare JavaScript Detections documents its injected script path under `/cdn-cgi/challenge-platform/` and notes that
`Cache-Control: no-transform` prevents that injection on responses where JavaScript Detections would otherwise run.

## Decision

vanityURLs HTML responses opt out of intermediary transformation. The Worker appends `no-transform` to the
`Cache-Control` header for HTML responses, and the static `_headers` fallback uses
`Cache-Control: no-store, no-transform` on HTML routes.

The operator recommendation remains to keep challenge-style or page-rewriting Cloudflare features disabled for public
redirect, lookup, and status HTML unless the instance intentionally accepts Cloudflare-owned script injection.

Do not weaken the default CSP with `unsafe-inline` or Cloudflare-generated hashes just to support dashboard-injected
JavaScript. If an operator wants JavaScript Detections on a separate application surface, that surface should carry its
own policy instead of changing the redirector baseline.

## Consequences

- Public HTML remains closer to the repository-built artifact that operators review and deploy
- Cloudflare JavaScript Detections should not inject its challenge-platform script into vanityURLs HTML responses that
  honor `no-transform`
- Strict CSP can remain strict without inline script allowances
- Operators can still enable Cloudflare blocking, rate limiting, Browser Integrity Check, Access, managed AI bot
  controls, and WAF rules that do not rewrite public HTML
- Challenge-based controls may still be useful on separate apps or protected admin surfaces, but they are not the
  vanityURLs public HTML baseline
