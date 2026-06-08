# 0017. Allow first-party splat namespace references and block loops

Date: 2026-06-08

Status: Accepted

## Context

Operators sometimes publish a static short link that intentionally targets a dynamic first-party namespace in the same
instance. Felix's instance uses this pattern for Bonjour Arcade aliases, such as a static `pacman` slug targeting
`https://f-l.ca/b/pacman`, where `b/*` is the canonical splat namespace.

This is different from public shortener loops. The target is not hiding an external destination behind another public
shortener; it is reusing a first-party route namespace controlled by the same operator.

At the same time, exact first-party aliases can become confusing when they create chains, and they become dangerous when
they create redirect loops.

## Decision

Treat first-party route references as a registry validation concern, separate from the public `shortener-loop` and
`platform-share` target checks.

- Exact links may target a first-party splat namespace, such as `pacman -> https://f-l.ca/b/pacman`, without warning.
- Exact links that target another exact first-party slug produce a warning.
- Exact first-party alias cycles produce a validation error.
- The check uses `custom/v8s-site-config.json` / `defaults/v8s-site-config.json` first-party domains, primarily
  `operator.short_domain`, plus Cloudflare route domains declared in `wrangler.toml` (`pattern` or `route`).

Operators who want two static slugs with the same destination should duplicate the long URL in each source link row
instead of making one static slug point at another static slug.

## Consequences

- Intentional first-party namespace reuse remains supported.
- Public shortener-loop detection stays focused on third-party shorteners and platform share domains.
- Deep exact alias chains are visible during build and check runs.
- Exact alias loops fail before deployment.
