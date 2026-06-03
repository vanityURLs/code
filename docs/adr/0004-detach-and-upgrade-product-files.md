# 0004. Detach instances and upgrade product files

Date: 2026-05-21

Status: Accepted

## Context

Users create their own instance repository from the vanityURLs code. That repository should become theirs, with its own
GitHub remote, while still being able to refresh product files from upstream.

## Decision

`npm run detach` removes upstream project metadata that should not belong to a new instance. It also replaces the
product README with `docs/README.md`, an operator-focused instance README, then removes `docs/` from the detached
instance.

`npm run upgrade` refreshes product-owned paths from upstream while protecting instance-owned paths such as `custom/`,
`wrangler.toml`, `.dev.vars`, and `README.md`.

The default upgrade path includes product files such as `defaults/`, `scripts/`, `package.json`, `package-lock.json`,
`LICENSE`, `.npmrc`, and `.prettierignore`. It does not refresh `README.md`, because `npm run detach` replaces the
upstream README with the operator-focused instance README.

## Consequences

- New instances can start as independent repositories
- Detached instances get an operator-focused README at the repository root
- Upgrades can refresh product behavior without overwriting local configuration
- Upgrades do not reintroduce the upstream product README into detached instances
- Protected local paths remain the operator's responsibility
- Release metadata and upstream workflow files do not leak into detached instances
