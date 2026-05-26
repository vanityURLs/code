# 0004. Detach instances and upgrade product files

Date: 2026-05-21

Status: Accepted

## Context

Users create their own instance repository from the vanityURLs code. That repository should become theirs, with its own GitHub remote, while still being able to refresh product files from upstream.

## Decision

`npm run detach` removes upstream project metadata that should not belong to a new instance.

`npm run upgrade` refreshes product-owned paths from upstream while protecting instance-owned paths such as `custom/`, `wrangler.toml`, and `.dev.vars`.

The default upgrade path includes product files such as `defaults/`, `scripts/`, `package.json`, `package-lock.json`, `README.md`, `LICENSE`, and `cloudflare-setup.md`.

## Consequences

- New instances can start as independent repositories
- Upgrades can refresh product behavior without overwriting local configuration
- Protected local paths remain the operator's responsibility
- Release metadata and upstream workflow files do not leak into detached instances
