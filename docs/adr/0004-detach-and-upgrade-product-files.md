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

Detached instances also remove product-only maintainer guidance and legacy helper wrappers such as `AGENTS.md`,
`RELEASE.md`, `RELEASE_WORKFLOW.md`, and `scripts/v8s.zsh`.

`npm run upgrade` refreshes product-owned paths from upstream while protecting instance-owned paths such as `custom/`,
`wrangler.toml`, `.dev.vars`, and `README.md`.

The upstream ref used for upgrade is a supply-chain trust boundary because upgrade verification can execute synced
product scripts. Release trust is governed by
[0015. Require signed release tags for trusted upgrades](0015-require-signed-release-tags.md).

The default upgrade path includes product files such as `defaults/`, `scripts/`, `package.json`, `package-lock.json`,
`LICENSE`, `.npmrc`, and `.prettierignore`. It does not refresh `README.md`, because `npm run detach` replaces the
upstream README with the operator-focused instance README.

When the upgrade detects missing verification tooling or changed package dependency definitions, it runs `npm install`
before validation. That keeps `node_modules/` aligned with refreshed `package.json` and `package-lock.json` before
`npm run check`-level verification runs.

Config defaults stay in `defaults/v8s-site-config.json`. Instance files in `custom/v8s-site-config.json` store only
operator choices and overrides. Build-time config loading deep-merges default and custom sections so additive product
defaults can reach existing instances without asking operators to rerun setup or rewrite local config files.

## Consequences

- New instances can start as independent repositories
- Detached instances get an operator-focused README at the repository root
- Upgrades can refresh product behavior without overwriting local configuration
- Upgrades do not reintroduce the upstream product README into detached instances
- Protected local paths remain the operator's responsibility
- Release metadata and upstream workflow files do not leak into detached instances
- Dependency updates during an upgrade can modify `package-lock.json`; operators should review and commit the resulting
  diff with the refreshed product files
- Additive default config fields can ship in `defaults/` and be inherited by existing instances without stored-config
  migrations
- Upgrade tooling should prefer verified signed release tags over mutable branch refs before executing synced product
  code
